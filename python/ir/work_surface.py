"""WorkSurface — indexed, queryable intent surface for event ingestion.

Not a FIFO queue. Events are indexed by type, priority, causal epoch, and
tags. Query, don't pop — events persist until dispatched or deferred.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any
import uuid

from .promotion_receipt import PromotionReceipt


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class WorkSurfaceStatus(str, Enum):
    UNASSIGNED = "UNASSIGNED"
    DISPATCHED = "DISPATCHED"
    DEFERRED = "DEFERRED"
    RESOLVED = "RESOLVED"


@dataclass(frozen=True)
class WorkSurfaceEntry:
    """An event on the WorkSurface with indexing metadata."""

    entry_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    event_id: str = ""
    event_type: str = ""
    priority: float = 0.5
    causal_epoch: int = 0
    status: WorkSurfaceStatus = WorkSurfaceStatus.UNASSIGNED
    timestamp: datetime = field(default_factory=_utc_now)
    tags: list[str] = field(default_factory=list)
    defer_reason: str = ""
    defer_until: datetime | None = None


@dataclass
class WorkSurface:
    """Indexed, queryable intent surface.

    Events enter via add() (which emits a PromotionReceipt), are queried
    via unassigned() or query(), and leave via dispatch/defer/resolve.
    """

    _entries: dict[str, WorkSurfaceEntry] = field(default_factory=dict)
    _by_type: dict[str, list[str]] = field(default_factory=lambda: defaultdict(list))
    _by_status: dict[WorkSurfaceStatus, list[str]] = field(default_factory=lambda: defaultdict(list))
    _by_tag: dict[str, list[str]] = field(default_factory=lambda: defaultdict(list))
    _receipts: list[PromotionReceipt] = field(default_factory=list)

    # ── ingestion ──────────────────────────────────────────────────

    def add(self, event: Any) -> WorkSurfaceEntry:
        """Add an event to the WorkSurface, emitting a PromotionReceipt.

        Returns the created WorkSurfaceEntry.
        """
        entry = WorkSurfaceEntry(
            event_id=getattr(event, "event_id", str(uuid.uuid4())),
            event_type=getattr(event, "event_type", ""),
            priority=getattr(event, "priority", 0.5),
            causal_epoch=getattr(event, "causal_epoch", 0),
            tags=list(getattr(event, "tags", [])),
            timestamp=getattr(event, "timestamp", _utc_now()),
        )
        self._entries[entry.entry_id] = entry
        self._by_type[entry.event_type].append(entry.entry_id)
        self._by_status[entry.status].append(entry.entry_id)
        for tag in entry.tags:
            self._by_tag[tag].append(entry.entry_id)

        # PromotionReceipt for event → WorkSurface
        receipt = PromotionReceipt(
            from_type="CausalEvent",
            from_id=entry.event_id,
            to_type="WorkSurfaceEntry",
            to_id=entry.entry_id,
            stage="ingest",
            metadata={
                "event_type": entry.event_type,
                "priority": entry.priority,
                "causal_epoch": entry.causal_epoch,
            },
        )
        self._receipts.append(receipt)
        return entry

    # ── query ──────────────────────────────────────────────────────

    def unassigned(self) -> list[WorkSurfaceEntry]:
        """Return all UNASSIGNED entries, ordered by priority (desc)."""
        ids = self._by_status.get(WorkSurfaceStatus.UNASSIGNED, [])
        entries = [self._entries[eid] for eid in ids if eid in self._entries]
        entries.sort(key=lambda e: (-e.priority, e.causal_epoch))
        return entries

    def deferred_due(self) -> list[WorkSurfaceEntry]:
        """Return deferred entries whose retry time has passed."""
        now = _utc_now()
        ids = self._by_status.get(WorkSurfaceStatus.DEFERRED, [])
        due = [
            self._entries[eid]
            for eid in ids
            if eid in self._entries and self._entries[eid].defer_until and self._entries[eid].defer_until <= now
        ]
        due.sort(key=lambda e: (-e.priority, e.causal_epoch))
        return due

    def query(
        self,
        event_type: str | None = None,
        priority_min: float | None = None,
        priority_max: float | None = None,
        causal_epoch_min: int | None = None,
        causal_epoch_max: int | None = None,
        tags: list[str] | None = None,
        status: WorkSurfaceStatus | None = None,
    ) -> list[WorkSurfaceEntry]:
        """Return entries matching all specified filters."""
        results: list[WorkSurfaceEntry] = []

        for entry in self._entries.values():
            if status is not None and entry.status != status:
                continue
            if event_type is not None and entry.event_type != event_type:
                continue
            if priority_min is not None and entry.priority < priority_min:
                continue
            if priority_max is not None and entry.priority > priority_max:
                continue
            if causal_epoch_min is not None and entry.causal_epoch < causal_epoch_min:
                continue
            if causal_epoch_max is not None and entry.causal_epoch > causal_epoch_max:
                continue
            if tags:
                if not all(t in entry.tags for t in tags):
                    continue
            results.append(entry)

        results.sort(key=lambda e: (-e.priority, e.causal_epoch))
        return results

    # ── lifecycle ──────────────────────────────────────────────────

    def _move_status(self, entry_id: str, new_status: WorkSurfaceStatus) -> None:
        entry = self._entries.get(entry_id)
        if not entry:
            return
        old_status = entry.status
        # Remove from old status index
        if entry_id in self._by_status.get(old_status, []):
            self._by_status[old_status].remove(entry_id)
        # Update entry
        object.__setattr__(entry, "status", new_status)
        # Add to new status index
        self._by_status[new_status].append(entry_id)

    def dispatch(self, entry_id: str) -> None:
        """Mark an entry as dispatched."""
        self._move_status(entry_id, WorkSurfaceStatus.DISPATCHED)

    def defer(self, entry_id: str, reason: str, retry_after_seconds: float = 30.0) -> None:
        """Move an entry to DEFERRED with a retry timestamp."""
        entry = self._entries.get(entry_id)
        if entry:
            object.__setattr__(entry, "defer_reason", reason)
            object.__setattr__(entry, "defer_until", _utc_now() + timedelta(seconds=retry_after_seconds))
        self._move_status(entry_id, WorkSurfaceStatus.DEFERRED)

    def retry(self, entry_id: str) -> None:
        """Move a deferred entry back to UNASSIGNED."""
        entry = self._entries.get(entry_id)
        if entry:
            object.__setattr__(entry, "defer_reason", "")
            object.__setattr__(entry, "defer_until", None)
        self._move_status(entry_id, WorkSurfaceStatus.UNASSIGNED)

    def resolve(self, entry_id: str) -> None:
        """Mark an entry as resolved (terminal)."""
        self._move_status(entry_id, WorkSurfaceStatus.RESOLVED)

    # ── properties ─────────────────────────────────────────────────

    @property
    def entry_count(self) -> int:
        return len(self._entries)

    @property
    def receipts(self) -> list[PromotionReceipt]:
        return list(self._receipts)

    @property
    def unassigned_count(self) -> int:
        return len(self._by_status.get(WorkSurfaceStatus.UNASSIGNED, []))

    @property
    def deferred_count(self) -> int:
        return len(self._by_status.get(WorkSurfaceStatus.DEFERRED, []))

    def get_entry(self, entry_id: str) -> WorkSurfaceEntry | None:
        return self._entries.get(entry_id)
