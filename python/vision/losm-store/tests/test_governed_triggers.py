"""Focused tests for the governed trigger adapter."""

from __future__ import annotations

from dataclasses import dataclass

from losm_store.governed_triggers import (
    GovernedTriggerAdapter,
    build_governed_trigger,
)


@dataclass
class _Result:
    rowcount: int


class _FakeSession:
    def __init__(self, rowcount: int = 1):
        self.rowcount = rowcount
        self.statements = []

    def execute(self, statement, params):
        self.statements.append((statement, params))
        return _Result(self.rowcount)


def test_trigger_identity_and_checkpoint_status():
    trigger = build_governed_trigger(
        source_event_id="lifecycle-001",
        kind="vision.lifecycle.transition.committed",
        outcome="committed",
        aggregate_id="wr-001",
        actor="planner",
    )

    assert trigger.event_id == "vision:lifecycle-001"
    assert trigger.idempotency_key == trigger.event_id
    assert trigger.to_outbox_params()["checkpoint_status"] == "pending"

    refused = build_governed_trigger(
        source_event_id="refused-001",
        kind="vision.lifecycle.transition.refused",
        outcome="refused",
    )
    assert refused.to_outbox_params()["checkpoint_status"] == "not_applicable"


def test_emit_writes_source_scoped_event_without_committing():
    db = _FakeSession(rowcount=1)
    adapter = GovernedTriggerAdapter()
    trigger = adapter.lifecycle_committed(
        event_id="life-002",
        wr_id="wr-002",
        from_state="EXECUTION",
        to_state="VALIDATION",
        actor="api",
        reason="checks complete",
    )

    assert adapter.emit(db, trigger) is True
    assert len(db.statements) == 1
    _, params = db.statements[0]
    assert params["source_namespace"] == "vision"
    assert params["source_event_id"] == "life-002"
    assert params["event_kind"] == "vision.lifecycle.transition.committed"
    assert params["outcome"] == "committed"
    assert params["checkpoint_status"] == "pending"
    assert params["read_set"]
    assert params["payload"]


def test_emit_reports_duplicate_without_second_semantic_action():
    db = _FakeSession(rowcount=0)
    adapter = GovernedTriggerAdapter()
    trigger = adapter.receipt_outcome(
        event_id="governance-003",
        wr_id="wr-003",
        event_type="RECEIPT_REJECTED",
        outcome="rejected",
        payload={"reason": "invalid lifecycle transition"},
    )

    assert adapter.emit(db, trigger) is False
    assert db.statements[0][1]["checkpoint_status"] == "not_applicable"


def test_generic_governance_decision_maps_decision_class():
    adapter = GovernedTriggerAdapter()
    trigger = adapter.governance_decision(
        event_id="auth-004",
        decision_class="authorization",
        aggregate_id="asset-004",
        outcome="refused",
        actor="policy-engine",
        read_set={"permission": "write"},
        payload={"required": "editor"},
    )

    assert trigger.kind == "vision.authorization.decision"
    assert trigger.outcome == "refused"
    assert trigger.aggregate_id == "asset-004"
    assert trigger.read_set == {"permission": "write"}
    assert trigger.to_outbox_params()["checkpoint_status"] == "not_applicable"


def test_generic_governance_decision_supports_future_classes():
    adapter = GovernedTriggerAdapter()
    for decision_class in ("admission", "rollback", "knowledge_issuance"):
        trigger = adapter.governance_decision(
            event_id=f"{decision_class}-005",
            decision_class=decision_class,
            aggregate_id="aggregate-005",
            outcome="committed",
            actor="test",
        )
        assert trigger.kind == f"vision.{decision_class.replace('_', '.')}.decision"
        assert trigger.to_outbox_params()["checkpoint_status"] == "pending"
