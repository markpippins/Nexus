"""W3.07 — Shadow comparison module.

Runs peb.decisions results against the compatibility adapter's doctrine
lookup in read-only shadow mode. Records divergences in an append-only
inventory for Architect review. Never mutates peb.decisions state, never
introduces blocking or advisory authority.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Protocol

__all__ = [
    "ComparisonVerdict",
    "ShadowComparison",
    "ShadowDivergence",
    "ShadowComparisonLog",
]


class ComparisonVerdict(str, Enum):
    """Verdict of one shadow comparison (read-only vocabulary)."""

    MATCH = "match"
    DIVERGENT = "divergent"
    ERROR = "error"


@dataclass(frozen=True)
class ShadowDivergence:
    """Append-only divergence record for Architect review."""

    at: str
    request_id: str
    peb_status: str
    adapter_status: str
    peb_detail: str | None
    adapter_detail: str | None
    verdict: ComparisonVerdict
    note: str | None = None


class PEBResultSource(Protocol):
    """Source of the PEB-derived result (read from existing kernel state)."""

    def peb_result(self, request_id: str) -> tuple[str, str | None]:
        """Return (status, detail) for a request id. Read-only."""
        ...


class AdapterResultSource(Protocol):
    """Source of the compatibility adapter result (doctrine lookup)."""

    def adapter_result(self, request_id: str) -> tuple[str, str | None]:
        """Return (status, detail) for a request id. Read-only."""
        ...


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class ShadowComparisonLog:
    """Append-only divergence inventory. Records are never rewritten."""

    def __init__(self) -> None:
        self._log: list[ShadowDivergence] = []

    def record(self, divergence: ShadowDivergence) -> None:
        self._log.append(divergence)

    def entries(self) -> tuple[ShadowDivergence, ...]:
        return tuple(self._log)

    def open_entries(self) -> tuple[ShadowDivergence, ...]:
        """Divergences are immutable once recorded; 'open' = not yet reviewed
        by the Architect (no review annotation exists in this read-only log).
        Kept for API symmetry with the retirement gate."""
        return tuple(self._log)

    def summary(self) -> dict[str, int]:
        counts: dict[str, int] = {v.value: 0 for v in ComparisonVerdict}
        for entry in self._log:
            counts[entry.verdict.value] += 1
        return counts


class ShadowComparison:
    """Read-only side-by-side comparison of PEB-derived results against the
    compatibility adapter. Writes nothing to peb.decisions; produces an
    append-only divergence inventory for Architect review."""

    def __init__(
        self,
        peb_source: PEBResultSource,
        adapter_source: AdapterResultSource,
        log: ShadowComparisonLog | None = None,
        now: Any = None,
    ) -> None:
        if peb_source is None or adapter_source is None:
            raise ValueError("shadow_comparison_requires_both_sources")
        self._peb = peb_source
        self._adapter = adapter_source
        self.log = log if log is not None else ShadowComparisonLog()
        self._now = now or _utcnow

    def compare(self, request_id: str, note: str | None = None) -> ShadowDivergence | None:
        """Run one read-only comparison. Returns the divergence when the two
        sources disagree; returns None on match. Nothing is ever written to
        peb.decisions. Source exceptions become ERROR verdicts (fail-closed,
        never a silent match)."""
        peb_status: str
        adapter_status: str
        try:
            peb_status, peb_detail = self._peb.peb_result(request_id)
        except Exception as exc:
            peb_status, peb_detail = "error", f"peb_source_error:{exc}"
        try:
            adapter_status, adapter_detail = self._adapter.adapter_result(request_id)
        except Exception as exc:
            adapter_status, adapter_detail = "error", f"adapter_source_error:{exc}"
        verdict = (
            ComparisonVerdict.MATCH
            if peb_status == adapter_status
            else ComparisonVerdict.DIVERGENT
        )
        if "source_error" in str(peb_detail) or "source_error" in str(adapter_detail):
            verdict = ComparisonVerdict.ERROR
        divergence = ShadowDivergence(
            at=self._now(),
            request_id=request_id,
            peb_status=peb_status,
            adapter_status=adapter_status,
            peb_detail=peb_detail,
            adapter_detail=adapter_detail,
            verdict=verdict,
            note=note,
        )
        # Full inventory is append-only; matches recorded too so the
        # comparison is auditable end to end.
        self.log.record(divergence)
        return divergence if verdict is ComparisonVerdict.DIVERGENT else None

    def compare_many(self, request_ids: list[str]) -> list[ShadowDivergence]:
        out = []
        for rid in request_ids:
            d = self.compare(rid)
            if d is not None:
                out.append(d)
        return out

    def review_inventory(self) -> dict[str, Any]:
        """Read-only inventory for Architect review."""
        return {
            "generated_at": self._now(),
            "summary": self.log.summary(),
            "divergences": [
                {
                    "at": d.at,
                    "request_id": d.request_id,
                    "peb_status": d.peb_status,
                    "adapter_status": d.adapter_status,
                    "peb_detail": d.peb_detail,
                    "adapter_detail": d.adapter_detail,
                    "verdict": d.verdict.value,
                    "note": d.note,
                }
                for d in self.log.entries()
                if d.verdict is ComparisonVerdict.DIVERGENT
            ],
        }
