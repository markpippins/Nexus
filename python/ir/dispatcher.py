"""Dispatcher — binds events to leases and emits DispatchEvents.

The final promotion boundary in the LS-IR pipeline: WorkSurface → DispatchEvent.
Each dispatch carries a PromotionReceipt recording the arbitration decision.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
import uuid

from .promotion_receipt import PromotionReceipt
from .work_surface import WorkSurface
from .lease_pool import LeasePool


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class DispatchEvent:
    """Records the binding of a WorkSurface entry to a lease.

    Carries a PromotionReceipt that records: which event, which lease,
    the arbitration score, and the dispatch timestamp.
    """

    dispatch_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    event_id: str = ""
    lease_id: str = ""
    score: float = 0.0
    timestamp: datetime = field(default_factory=_utc_now)
    promotion_receipt: PromotionReceipt | None = None

    @classmethod
    def from_arbitration(
        cls, event: Any, lease: Any, score: float
    ) -> "DispatchEvent":
        """Create a DispatchEvent with a full PromotionReceipt."""
        lease_id = getattr(lease, "lease_id", "")
        role = getattr(lease, "role", None)
        role_name = getattr(role, "role_name", str(role)) if role else ""
        caps = cls._extract_capabilities(lease)

        dispatch_id = str(uuid.uuid4())
        receipt = PromotionReceipt(
            from_type="WorkSurface",
            from_id=getattr(event, "event_id", ""),
            to_type="DispatchEvent",
            to_id=dispatch_id,
            stage="dispatch",
            metadata={
                "lease_id": lease_id,
                "role": role_name,
                "score": score,
                "capabilities": caps,
            },
        )
        # Recreate receipt with correct to_id
        receipt = PromotionReceipt(
            receipt_id=receipt.receipt_id,
            from_type=receipt.from_type,
            from_id=receipt.from_id,
            to_type=receipt.to_type,
            to_id=dispatch_id,
            stage=receipt.stage,
            metadata=receipt.metadata,
            timestamp=receipt.timestamp,
            compiler_version=receipt.compiler_version,
        )
        return cls(
            dispatch_id=dispatch_id,
            event_id=getattr(event, "event_id", ""),
            lease_id=lease_id,
            score=score,
            promotion_receipt=receipt,
        )

    @staticmethod
    def _extract_capabilities(lease: Any) -> list[str]:
        """Extract capability strings from a lease for receipt metadata."""
        caps = getattr(lease, "capabilities", None)
        if caps is None:
            return []
        if hasattr(caps, "capabilities") and hasattr(caps.capabilities, "__iter__"):
            return sorted(caps.capabilities)
        if isinstance(caps, (set, frozenset)):
            return sorted(caps)
        if isinstance(caps, list):
            return sorted(caps)
        return []


@dataclass
class Dispatcher:
    """Binds events to leases, updating WorkSurface and LeasePool.

    Each dispatch:
    1. Acquires the lease in the pool
    2. Creates a DispatchEvent with PromotionReceipt
    3. Marks the WorkSurface entry as DISPATCHED
    4. Sets lease_time on the event's TimeModel if present
    """

    work_surface: WorkSurface = field(default_factory=WorkSurface)
    lease_pool: LeasePool = field(default_factory=LeasePool)

    def dispatch(
        self, event: Any, lease: Any, score: float
    ) -> DispatchEvent | None:
        """Bind an event to a lease for execution.

        Args:
            event: The event to dispatch (WorkSurfaceEntry or raw event).
            lease: The lease to bind to.
            score: The arbitration score that selected this lease.

        Returns:
            DispatchEvent if successful, None if acquire failed.
        """
        lease_id = getattr(lease, "lease_id", "")
        entry_id = getattr(event, "entry_id", getattr(event, "event_id", ""))

        # Acquire the lease
        binding = self.lease_pool.acquire(lease_id, event)
        if binding is None:
            return None

        # Create dispatch event
        dispatch_event = DispatchEvent.from_arbitration(event, lease, score)

        # Mark work surface entry as dispatched
        if entry_id:
            self.work_surface.dispatch(entry_id)

        # Set lease_time on the event's TimeModel if present
        time_model = getattr(event, "time_model", None)
        if time_model and hasattr(time_model, "with_lease_time"):
            # TimeModel.with_lease_time returns a new instance
            new_tm = time_model.with_lease_time(_utc_now())
            object.__setattr__(event, "time_model", new_tm)

        return dispatch_event
