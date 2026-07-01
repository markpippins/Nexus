"""PromotionReceipt — immutable record of a representation promotion.

Each receipt says: "I promoted representation X into representation Y."
Promotion means compilation, not subtyping — the original still exists
and can be re-promoted differently.
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any
import uuid


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class PromotionReceipt:
    """Immutable receipt recording a promotion from one representation to another.

    Attributes:
        receipt_id: UUID identifying this specific promotion.
        from_type: Human-readable name of the source representation
                   (e.g., "Edge", "Trace", "CEREvent", "EventProjection").
        from_id: Identifier of the source representation.
        to_type: Human-readable name of the promoted representation
                 (e.g., "CausalEdge", "StateVersion", "IntentGraph").
        to_id: Identifier of the promoted representation.
        stage: Pipeline stage that performed the promotion
               (e.g., "causality_inference", "replay_snapshot", "project").
        metadata: Arbitrary stage-specific context (event_count, role, etc.).
        timestamp: When the promotion occurred (UTC).
        compiler_version: Version string for deterministic replay.
    """

    receipt_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    from_type: str = ""
    from_id: str = ""
    to_type: str = ""
    to_id: str = ""
    stage: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=_utc_now)
    compiler_version: str = "ir-v1.0.0"

    def description(self) -> str:
        """Human-readable summary of this promotion."""
        meta = ", ".join(f"{k}={v}" for k, v in self.metadata.items())
        suffix = f" ({meta})" if meta else ""
        return f"Promoted {self.from_type}({self.from_id}) into {self.to_type}({self.to_id}) at stage={self.stage}{suffix}"

    def to_dict(self) -> dict:
        d = asdict(self)
        d["timestamp"] = self.timestamp.isoformat()
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "PromotionReceipt":
        data = dict(d)
        if "timestamp" in data and isinstance(data["timestamp"], str):
            data["timestamp"] = datetime.fromisoformat(data["timestamp"])
        # Handle optional fields that may be missing in older serialized forms
        data.setdefault("from_type", "")
        data.setdefault("from_id", "")
        data.setdefault("to_type", "")
        data.setdefault("to_id", "")
        data.setdefault("stage", "")
        data.setdefault("metadata", {})
        data.setdefault("compiler_version", "ir-v1.0.0")
        return cls(**data)

    def __repr__(self) -> str:
        return f"PromotionReceipt({self.description()})"
