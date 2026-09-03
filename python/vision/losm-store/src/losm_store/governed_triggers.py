"""Governed trigger adapters for the Keychains projection boundary.

The adapter is deliberately small and source-neutral. Vision remains the
authority for lifecycle and governance state; this module only records a
compact event envelope in the Resolution outbox for Keychains consumption.
The caller owns the transaction and must commit or roll back the decision.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session


GOVERNED_TRIGGER_SCHEMA_VERSION = 1


@dataclass(frozen=True)
class GovernedTrigger:
    """Normalized event emitted at a governed decision boundary."""

    source_namespace: str
    source_event_id: str
    kind: str
    outcome: str
    aggregate_id: Optional[str] = None
    causation_id: Optional[str] = None
    correlation_id: Optional[str] = None
    actor: Optional[str] = None
    contract_id: str = "governed-trigger.v1"
    evaluator_id: Optional[str] = None
    law_id: Optional[str] = None
    effective_at: Optional[str] = None
    recorded_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    read_set: Dict[str, Any] = field(default_factory=dict)
    payload: Dict[str, Any] = field(default_factory=dict)

    @property
    def event_id(self) -> str:
        return f"{self.source_namespace}:{self.source_event_id}"

    @property
    def idempotency_key(self) -> str:
        return self.event_id

    def to_outbox_params(self) -> Dict[str, Any]:
        return {
            "source_namespace": self.source_namespace,
            "source_event_id": self.source_event_id,
            "event_kind": self.kind,
            "outcome": self.outcome,
            "schema_version": GOVERNED_TRIGGER_SCHEMA_VERSION,
            "aggregate_id": self.aggregate_id,
            "causation_id": self.causation_id,
            "correlation_id": self.correlation_id,
            "actor": self.actor,
            "contract_id": self.contract_id,
            "evaluator_id": self.evaluator_id,
            "law_id": self.law_id,
            "effective_at": self.effective_at,
            "recorded_at": self.recorded_at,
            "read_set": json.dumps(self.read_set, sort_keys=True, default=str),
            "payload": json.dumps(self.payload, sort_keys=True, default=str),
            "checkpoint_status": (
                "not_applicable" if self.outcome != "committed" else "pending"
            ),
        }


def build_governed_trigger(
    *,
    source_event_id: str,
    kind: str,
    outcome: str,
    aggregate_id: Optional[str] = None,
    causation_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    actor: Optional[str] = None,
    effective_at: Optional[str] = None,
    read_set: Optional[Dict[str, Any]] = None,
    payload: Optional[Dict[str, Any]] = None,
    source_namespace: str = "vision",
) -> GovernedTrigger:
    """Build a deterministic, source-scoped governed-trigger envelope."""
    return GovernedTrigger(
        source_namespace=source_namespace,
        source_event_id=source_event_id,
        kind=kind,
        outcome=outcome,
        aggregate_id=aggregate_id,
        causation_id=causation_id,
        correlation_id=correlation_id,
        actor=actor,
        effective_at=effective_at,
        read_set=dict(read_set or {}),
        payload=dict(payload or {}),
    )


class GovernedTriggerAdapter:
    """Translate Vision decision outcomes into durable Keychains events."""

    def emit(self, db: Session, trigger: GovernedTrigger) -> bool:
        """Insert an outbox event without committing the caller's transaction.

        ``ON CONFLICT DO NOTHING`` makes retries idempotent against the
        source-scoped event identity. Returning ``False`` means the event was
        already present; it is still safe for the caller to commit its own
        decision transaction.
        """
        result = db.execute(
            text(
                """
                INSERT INTO resolution.keychain_event_outbox (
                    source_namespace, source_event_id, event_kind, outcome,
                    schema_version, aggregate_id, causation_id, correlation_id,
                    actor, contract_id, evaluator_id, law_id, effective_at,
                    recorded_at, read_set, payload, checkpoint_status
                ) VALUES (
                    :source_namespace, :source_event_id, :event_kind, :outcome,
                    :schema_version, :aggregate_id, :causation_id, :correlation_id,
                    :actor, :contract_id, :evaluator_id, :law_id, :effective_at,
                    :recorded_at, CAST(:read_set AS jsonb), CAST(:payload AS jsonb),
                    :checkpoint_status
                )
                ON CONFLICT (source_namespace, source_event_id) DO NOTHING
                """
            ),
            trigger.to_outbox_params(),
        )
        return bool(result.rowcount)

    def lifecycle_committed(
        self,
        *,
        event_id: str,
        wr_id: str,
        from_state: str,
        to_state: str,
        actor: str,
        reason: Optional[str],
    ) -> GovernedTrigger:
        return build_governed_trigger(
            source_event_id=event_id,
            kind="vision.lifecycle.transition.committed",
            outcome="committed",
            aggregate_id=wr_id,
            causation_id=event_id,
            correlation_id=wr_id,
            actor=actor,
            read_set={
                "work_request_id": wr_id,
                "from_state": from_state,
                "to_state": to_state,
            },
            payload={
                "reason": reason,
                "transition_event_id": event_id,
            },
        )

    def lifecycle_refused(
        self,
        *,
        source_event_id: str,
        wr_id: str,
        from_state: str,
        to_state: str,
        actor: str,
        reason: Optional[str],
    ) -> GovernedTrigger:
        return build_governed_trigger(
            source_event_id=source_event_id,
            kind="vision.lifecycle.transition.refused",
            outcome="refused",
            aggregate_id=wr_id,
            correlation_id=wr_id,
            actor=actor,
            read_set={
                "work_request_id": wr_id,
                "from_state": from_state,
                "requested_state": to_state,
            },
            payload={"reason": reason},
        )

    def governance_decision(
        self,
        *,
        event_id: str,
        decision_class: str,
        aggregate_id: str,
        outcome: str,
        actor: str,
        read_set: Optional[Dict[str, Any]] = None,
        payload: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None,
    ) -> GovernedTrigger:
        """Adapt an admission/authorization/rollback/knowledge decision.

        These classes share the same boundary contract even when their owning
        services differ. The owning caller supplies the authoritative event
        ID and commits its own decision transaction.
        """
        normalized_class = decision_class.strip().lower().replace("_", ".")
        return build_governed_trigger(
            source_event_id=event_id,
            kind=f"vision.{normalized_class}.decision",
            outcome=outcome,
            aggregate_id=aggregate_id,
            causation_id=event_id,
            correlation_id=correlation_id or aggregate_id,
            actor=actor,
            read_set=dict(read_set or {}),
            payload=dict(payload or {}),
        )

    def receipt_outcome(
        self,
        *,
        event_id: str,
        wr_id: str,
        event_type: str,
        outcome: str,
        actor: str = "receipt-ingestor",
        payload: Optional[Dict[str, Any]] = None,
    ) -> GovernedTrigger:
        suffix = event_type.lower().replace("_", ".")
        return build_governed_trigger(
            source_event_id=event_id,
            kind=f"vision.receipt.{suffix}",
            outcome=outcome,
            aggregate_id=wr_id,
            causation_id=event_id,
            correlation_id=wr_id,
            actor=actor,
            read_set={"work_request_id": wr_id, "governance_event_id": event_id},
            payload=dict(payload or {}),
        )


__all__ = [
    "GOVERNED_TRIGGER_SCHEMA_VERSION",
    "GovernedTrigger",
    "GovernedTriggerAdapter",
    "build_governed_trigger",
]
