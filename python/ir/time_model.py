"""TimeModel — three-layer time container for TEM-IR.

Distinguishes Event Time (wall clock), Lease Time (when execution
consumed the event), and Causal Time (logical epoch ordering).
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class TimeModel:
    """Three-layer time model for causal events.

    Attributes:
        event_time: When the event actually occurred (wall clock).
        lease_time: When a lease consumed this event for execution (set by LS-IR).
                    None until the event is dispatched.
        causal_epoch: Logical ordering integer.  Monotonically increasing.
                      Assigned at event creation: max(parent_epochs) + 1.
    """

    event_time: datetime = field(default_factory=_utc_now)
    lease_time: datetime | None = None
    causal_epoch: int = 0

    def with_lease_time(self, lt: datetime) -> TimeModel:
        """Return a new TimeModel with lease_time set.

        Does NOT modify the original (frozen).
        """
        return TimeModel(
            event_time=self.event_time,
            lease_time=lt,
            causal_epoch=self.causal_epoch,
        )

    def to_dict(self) -> dict:
        d = asdict(self)
        d["event_time"] = self.event_time.isoformat()
        if self.lease_time:
            d["lease_time"] = self.lease_time.isoformat()
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "TimeModel":
        data = dict(d)
        if "event_time" in data and isinstance(data["event_time"], str):
            data["event_time"] = datetime.fromisoformat(data["event_time"])
        if data.get("lease_time") and isinstance(data["lease_time"], str):
            data["lease_time"] = datetime.fromisoformat(data["lease_time"])
        return cls(**data)
