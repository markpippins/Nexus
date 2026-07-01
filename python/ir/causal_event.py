"""CausalEvent — MEEP CEREvent promoted with typed causal parents and TimeModel.

Promotes raw CEREvents into temporally-aware causal events via the
``from_cer_event`` factory.  Also provides promotion from NBK Edges into
``CausalEdge`` objects via ``from_nbk_edge``.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any

from .state_dag import CausalEdgeType
from .causal_edge import CausalEdge
from .time_model import TimeModel
from .promotion_receipt import PromotionReceipt


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _next_epoch(parents: list[CausalEdge]) -> int:
    """Compute the causal epoch for a new event given its causal parents."""
    if not parents:
        return 1
    max_epoch = 0
    for edge in parents:
        meta = edge.metadata or {}
        epoch = meta.get("causal_epoch", 0)
        if epoch > max_epoch:
            max_epoch = epoch
    return max_epoch + 1


@dataclass(frozen=True)
class CausalEvent:
    """An event promoted from a raw CEREvent with causal semantics.

    Attributes:
        event_id: Unique identifier (preserved from CEREvent).
        timestamp: ISO-8601 UTC wall-clock time.
        event_type: MEEP event type (NODE_START, NODE_COMPLETE, etc.).
        payload: Arbitrary event data.
        prev_event_hash: Hash chain link (preserved from CEREvent).
        execution_id: MEEP execution identifier.
        node_id: MEEP node identifier.
        causal_parents: Typed causal edges from parent events.
        time_model: Three-layer time (event, lease, causal epoch).
        promotion_receipt: How this event was promoted from a CEREvent.
    """

    event_id: str
    timestamp: str = field(default_factory=lambda: _utc_now().isoformat())
    # ^ preserved from CEREvent for backward compatibility.
    #   Canonical time is ``time_model.event_time`` (datetime).
    #   These two always agree at construction time (both frozen).
    event_type: str = ""
    payload: dict[str, Any] = field(default_factory=dict)
    prev_event_hash: str = ""
    execution_id: str = ""
    node_id: str = ""
    causal_parents: list[CausalEdge] = field(default_factory=list)
    time_model: TimeModel = field(default_factory=TimeModel)
    promotion_receipt: PromotionReceipt | None = None

    @classmethod
    def from_cer_event(
        cls,
        cer: Any,  # duck-typed CEREvent
        parents: list[CausalEdge] | None = None,
    ) -> "CausalEvent":
        """Promote a MEEP CEREvent into a CausalEvent.

        Args:
            cer: A duck-typed CEREvent with event_id, timestamp, event_type,
                 payload, prev_event_hash, execution_id, node_id.
            parents: Causal edges from parent events (may be empty for first event).

        Returns:
            A CausalEvent with three-layer time model and promotion receipt.
        """
        parents = parents or []
        epoch = _next_epoch(parents)

        # Extract CEREvent fields via duck-typing
        event_id = getattr(cer, "event_id", "")
        timestamp = getattr(cer, "timestamp", _utc_now().isoformat())
        event_type = getattr(cer, "event_type", "")
        payload = getattr(cer, "payload", {})
        prev_hash = getattr(cer, "prev_event_hash", "")
        exec_id = getattr(cer, "execution_id", "")
        node_id = getattr(cer, "node_id", "")

        receipt = PromotionReceipt(
            from_type="CEREvent",
            from_id=event_id,
            to_type="CausalEvent",
            to_id=event_id,
            stage="from_cer_event",
            metadata={
                "parent_count": len(parents),
                "causal_epoch": epoch,
            },
        )

        return cls(
            event_id=event_id,
            timestamp=timestamp,
            event_type=event_type,
            payload=payload,
            prev_event_hash=prev_hash,
            execution_id=exec_id,
            node_id=node_id,
            causal_parents=list(parents),
            time_model=TimeModel(
                event_time=datetime.fromisoformat(timestamp) if timestamp else _utc_now(),
                lease_time=None,
                causal_epoch=epoch,
            ),
            promotion_receipt=receipt,
        )

    def to_dict(self) -> dict:
        d = asdict(self)
        if self.promotion_receipt:
            d["promotion_receipt"] = self.promotion_receipt.to_dict()
        if self.causal_parents:
            d["causal_parents"] = [p.to_dict() for p in self.causal_parents]
        d["time_model"] = self.time_model.to_dict()
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "CausalEvent":
        data = dict(d)
        if data.get("promotion_receipt") and isinstance(data["promotion_receipt"], dict):
            data["promotion_receipt"] = PromotionReceipt.from_dict(data["promotion_receipt"])
        if data.get("causal_parents"):
            data["causal_parents"] = [
                CausalEdge.from_dict(p) for p in data["causal_parents"]
            ]
        if "time_model" in data and isinstance(data["time_model"], dict):
            data["time_model"] = TimeModel.from_dict(data["time_model"])
        return cls(**data)
