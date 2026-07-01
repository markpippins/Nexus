"""LeasePool — manages idle/active leases, capacity tracking, and preemption.

Consumes the real RoleLease type from RL-IR (no stub needed).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
import uuid


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class LeaseBinding:
    """Records the binding of an event to a lease."""

    binding_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    lease_id: str = ""
    event_id: str = ""
    entry_id: str = ""  # WorkSurfaceEntry.entry_id for preemption retry
    event_type: str = ""
    event_priority: float = 0.5
    bound_at: datetime = field(default_factory=_utc_now)


@dataclass
class LeaseSlot:
    """Internal tracking slot for a lease in the pool."""

    lease: Any  # RoleLease
    binding: LeaseBinding | None = None
    active: bool = False
    load: float = 0.0  # 0.0 (idle) to 1.0 (fully loaded)
    preemptible: bool = True
    lease_count: int = 0  # total leases processed by this slot


@dataclass
class LeasePool:
    """Tracks idle/active leases with capacity limits and preemption.

    Works with the real RoleLease type — no stub needed.  Reads
    lease_id, status, capabilities, and role from the RoleLease.
    """

    _slots: dict[str, LeaseSlot] = field(default_factory=dict)
    max_active: int = 10
    preemption_enabled: bool = False

    # ── registration ───────────────────────────────────────────────

    def register(self, lease: Any) -> None:
        """Register a lease with the pool."""
        lid = getattr(lease, "lease_id", str(uuid.uuid4()))
        if lid not in self._slots:
            self._slots[lid] = LeaseSlot(lease=lease)

    def deregister(self, lease_id: str) -> None:
        """Remove a lease from the pool."""
        self._slots.pop(lease_id, None)

    # ── acquire / release ──────────────────────────────────────────

    def acquire(self, lease_id: str, event: Any) -> LeaseBinding | None:
        """Try to bind a lease to an event. Returns LeaseBinding or None at capacity."""
        slot = self._slots.get(lease_id)
        if not slot:
            return None

        active_count = sum(1 for s in self._slots.values() if s.active)
        if active_count >= self.max_active:
            return None

        binding = LeaseBinding(
            lease_id=lease_id,
            event_id=getattr(event, "event_id", ""),
            entry_id=getattr(event, "entry_id", ""),
            event_type=getattr(event, "event_type", ""),
            event_priority=getattr(event, "priority", 0.5),
        )
        slot.binding = binding
        slot.active = True
        slot.lease_count += 1
        return binding

    def release(self, lease_id: str) -> None:
        """Release a lease back to idle."""
        slot = self._slots.get(lease_id)
        if slot:
            slot.binding = None
            slot.active = False
            slot.load = 0.0

    def set_load(self, lease_id: str, load: float) -> None:
        """Update a lease's load factor (0.0–1.0)."""
        slot = self._slots.get(lease_id)
        if slot and 0.0 <= load <= 1.0:
            slot.load = load

    # ── queries ────────────────────────────────────────────────────

    def idle_leases(self) -> list[Any]:
        """Return all idle (not active) leases."""
        return [s.lease for s in self._slots.values() if not s.active]

    def active_leases(self) -> list[Any]:
        """Return all active leases."""
        return [s.lease for s in self._slots.values() if s.active]

    def idle_slots(self) -> list[LeaseSlot]:
        """Return idle LeaseSlots (with load info)."""
        return [s for s in self._slots.values() if not s.active]

    def get_slot(self, lease_id: str) -> LeaseSlot | None:
        """Return the slot for a lease."""
        return self._slots.get(lease_id)

    # ── capacity ───────────────────────────────────────────────────

    @property
    def active_count(self) -> int:
        return sum(1 for s in self._slots.values() if s.active)

    @property
    def idle_count(self) -> int:
        return sum(1 for s in self._slots.values() if not s.active)

    @property
    def total_count(self) -> int:
        return len(self._slots)

    def at_capacity(self) -> bool:
        return self.active_count >= self.max_active

    # ── preemption ─────────────────────────────────────────────────

    def find_preemption_target(self, event_priority: float) -> LeaseSlot | None:
        """Find the lowest-priority active lease for preemption."""
        if not self.preemption_enabled:
            return None

        active = [s for s in self._slots.values() if s.active and s.preemptible]
        if not active:
            return None

        # Find the lowest-priority binding
        active.sort(key=lambda s: s.binding.event_priority if s.binding else 0.0)
        lowest = active[0]
        if lowest.binding and lowest.binding.event_priority < event_priority:
            return lowest
        return None

    def preempt(self, slot: LeaseSlot) -> str | None:
        """Preempt a lease — release it and return the entry_id to requeue."""
        if not slot.binding:
            return None
        entry_id = slot.binding.entry_id or slot.binding.event_id
        slot.binding = None
        slot.active = False
        slot.load = 0.0
        return entry_id

    # ── telemetry ──────────────────────────────────────────────────

    def telemetry(self) -> dict:
        """Return pool telemetry snapshot."""
        return {
            "total": self.total_count,
            "active": self.active_count,
            "idle": self.idle_count,
            "max_active": self.max_active,
            "preemption_enabled": self.preemption_enabled,
            "total_leases_processed": sum(s.lease_count for s in self._slots.values()),
        }
