"""Tests for the PEB to Keychains governed-trigger adapter."""

from __future__ import annotations

import json
from dataclasses import dataclass
from uuid import uuid4

from peb_kernel.domain import AdmissionResult, PebTransaction
from peb_kernel.keychains import PebKeychainsAdapter


@dataclass
class _Transaction:
    id: object
    idempotency_key: str
    entity_id: str
    tool_name: str
    admission_result: AdmissionResult | None
    before_hash: str | None = None
    after_hash: str | None = None
    kernel_event_id: object | None = None
    kernel_event_type: str | None = None
    created_at: str = "2026-09-03T00:00:00+00:00"


class _Cursor:
    def __init__(self):
        self.calls = []

    def execute(self, statement, params):
        self.calls.append((statement, params))


class _Connection:
    def __init__(self):
        self._cursor = _Cursor()

    def cursor(self):
        return self._cursor


def _transaction(result: AdmissionResult | None) -> _Transaction:
    return _Transaction(
        id=uuid4(),
        idempotency_key="peb-test-key",
        entity_id="entity-1",
        tool_name="peb_record_decision",
        admission_result=result,
    )


def test_allowed_transaction_is_checkpoint_eligible():
    conn = _Connection()
    PebKeychainsAdapter().emit_transaction(conn, _transaction(AdmissionResult.ALLOWED))

    _, params = conn._cursor.calls[0]
    assert params[0] == "peb"
    assert params[2] == "peb.admission.committed"
    assert params[3] == "committed"
    assert params[-1] == "pending"
    assert "ON CONFLICT (source_namespace, source_event_id) DO NOTHING" in conn._cursor.calls[0][0]


def test_rejected_transaction_is_archived_without_checkpoint():
    conn = _Connection()
    PebKeychainsAdapter().emit_transaction(conn, _transaction(AdmissionResult.REJECTED))

    _, params = conn._cursor.calls[0]
    assert params[2] == "peb.admission.rejected"
    assert params[3] == "rejected"
    assert params[-1] == "not_applicable"


def _binding_transaction(disposition: str = "allow") -> _Transaction:
    return _Transaction(
        id=uuid4(),
        idempotency_key=f"binding-{disposition}",
        entity_id="candidate-1",
        tool_name="peb_record_decision",
        admission_result=AdmissionResult.ALLOWED,
        before_hash="before",
        after_hash="after",
    )


def _attach_binding(
    transaction: _Transaction,
    disposition: str = "allow",
    observation: bool = False,
) -> _Transaction:
    transaction.input = {
        "binding_decision": {
            "binding_contract_version": 1,
            "decision_class": "deny_contract_promotion",
            "contract": {"id": "promotion-contract", "version": "1"},
            "proposition_id": "pg:ready",
            "doctrine_ids": ["law-1"],
            "evaluator": {"id": "sol", "version": "w8.08"},
            "evidence_ids": ["evidence-1"],
            "subject_id": "candidate-1",
            "work_item_id": "work-1",
            "as_of": "2026-09-04T12:00:00Z",
            "disposition": disposition,
            "authority_level": "narrowly_binding",
            "authorization_ref": "986ec482",
            "evaluation_fingerprint": "sha256:" + "ab" * 32,
            "decision_id": f"decision-{disposition}",
            "evidence_fresh": True,
            "replay_context": "attempt-1",
            "lineage_fingerprint": "sha256:" + "cd" * 32,
            "law_version": "w8.08",
            "bridge_id": "peb-keychains-outbox",
            "bridge_version": "1",
        },
    }
    if observation:
        transaction.input["binding_decision"]["observation_window"] = {
            "activation_ref": "w9-activation-1",
            "activated_at": "2026-09-05T12:00:00Z",
            "window_start": "2026-09-05T12:00:00Z",
            "window_end": "2026-09-05T13:00:00Z",
            "binding_owner": "resolution",
            "authority_ref": "g1-verdict-986ec482",
            "authorization_ref": "w1.10-grant-05d0fe54",
            "grant_id": "05d0fe54",
            "rollback_ref": "rollback-plan-w9",
            "rollback_status": "armed",
            "rollback_evidence_ids": ["rollback-evidence-1"],
        }
    return transaction


def test_binding_decision_emits_complete_keychains_provenance():
    conn = _Connection()
    tx = _attach_binding(_binding_transaction(), "allow")
    PebKeychainsAdapter().emit_transaction(conn, tx)

    statement, params = conn._cursor.calls[0]
    assert params[1] == "binding:decision-allow:sha256:" + "ab" * 32
    assert params[2] == "peb.deny_contract_promotion.committed"
    assert params[3] == "committed"
    assert params[9] == "promotion-contract"
    assert params[10] == "sol"
    assert params[11] == "law-1"
    assert params[-1] == "pending"
    read_set = json.loads(params[14])
    payload = json.loads(params[15])
    assert read_set["decision_class"] == "deny_contract_promotion"
    assert read_set["authorization_ref"] == "986ec482"
    assert read_set["evaluation_fingerprint"] == "sha256:" + "ab" * 32
    assert payload["decision_id"] == "decision-allow"
    assert payload["outcome"] == "committed"
    assert "evaluator_version" in read_set
    assert "ON CONFLICT (source_namespace, source_event_id) DO NOTHING" in statement


def test_post_activation_observation_window_is_preserved():
    conn = _Connection()
    tx = _attach_binding(_binding_transaction(), observation=True)
    PebKeychainsAdapter().emit_transaction(conn, tx)

    _, params = conn._cursor.calls[0]
    read_set = json.loads(params[14])
    payload = json.loads(params[15])
    assert read_set["activation_ref"] == "w9-activation-1"
    assert read_set["activated_at"] == "2026-09-05T12:00:00Z"
    assert read_set["observation_window"]["window_start"] == "2026-09-05T12:00:00Z"
    assert read_set["observation_window"]["window_end"] == "2026-09-05T13:00:00Z"
    assert read_set["binding_owner"] == "resolution"
    assert read_set["authority_ref"] == "g1-verdict-986ec482"
    assert read_set["grant_id"] == "05d0fe54"
    assert read_set["rollback_ref"] == "rollback-plan-w9"
    assert read_set["rollback_status"] == "armed"
    assert read_set["rollback_evidence_ids"] == ["rollback-evidence-1"]
    assert payload["activation_ref"] == "w9-activation-1"
    assert payload["rollback_ref"] == "rollback-plan-w9"


def test_incomplete_post_activation_observation_fails_closed():
    conn = _Connection()
    tx = _attach_binding(_binding_transaction(), observation=True)
    del tx.input["binding_decision"]["observation_window"]["activation_ref"]
    import pytest
    with pytest.raises(ValueError, match="observation window missing provenance"):
        PebKeychainsAdapter().emit_transaction(conn, tx)
    assert conn._cursor.calls == []



def test_observation_window_rejects_bounds_before_activation():
    conn = _Connection()
    tx = _attach_binding(_binding_transaction(), observation=True)
    tx.input["binding_decision"]["observation_window"]["window_start"] = "2026-09-04T23:59:00Z"
    import pytest
    with pytest.raises(ValueError, match="observation window bounds"):
        PebKeychainsAdapter().emit_transaction(conn, tx)
    assert conn._cursor.calls == []


def test_observation_window_rejects_invalid_order():
    conn = _Connection()
    tx = _attach_binding(_binding_transaction(), observation=True)
    tx.input["binding_decision"]["observation_window"]["window_end"] = "2026-09-05T11:59:00Z"
    import pytest
    with pytest.raises(ValueError, match="observation window bounds"):
        PebKeychainsAdapter().emit_transaction(conn, tx)
    assert conn._cursor.calls == []


def test_all_binding_negative_dispositions_archive_without_checkpoint():
    dispositions = ("refused", "unknown", "stale", "drift", "quarantined", "superseded", "rolled_back")
    for disposition in dispositions:
        conn = _Connection()
        tx = _attach_binding(_binding_transaction(disposition), disposition)
        PebKeychainsAdapter().emit_transaction(conn, tx)
        _, params = conn._cursor.calls[0]
        assert params[2] == f"peb.deny_contract_promotion.{disposition}"
        assert params[3] == disposition
        assert params[-1] == "pending"
        assert json.loads(params[15])["disposition"] == disposition


def test_unauthorized_binding_class_fails_closed_before_outbox_write():
    conn = _Connection()
    tx = _attach_binding(_binding_transaction(), "allow")
    tx.input["binding_decision"]["decision_class"] = "other-class"
    import pytest
    with pytest.raises(ValueError, match="unauthorized Keychains decision class"):
        PebKeychainsAdapter().emit_transaction(conn, tx)
    assert conn._cursor.calls == []


def test_incomplete_binding_provenance_fails_closed_before_outbox_write():
    conn = _Connection()
    tx = _attach_binding(_binding_transaction(), "allow")
    del tx.input["binding_decision"]["evidence_ids"]
    import pytest
    with pytest.raises(ValueError, match="missing provenance"):
        PebKeychainsAdapter().emit_transaction(conn, tx)
    assert conn._cursor.calls == []


def test_routed_or_missing_outcome_is_explicitly_unknown():
    adapter = PebKeychainsAdapter()
    assert adapter._outcome(_transaction(AdmissionResult.ROUTED)) == "unknown"
    assert adapter._outcome(_transaction(None)) == "unknown"


def test_event_identity_is_stable_for_one_peb_transaction():
    tx = _transaction(AdmissionResult.ALLOWED)
    conn = _Connection()
    adapter = PebKeychainsAdapter()
    adapter.emit_transaction(conn, tx)
    adapter.emit_transaction(conn, tx)

    first = conn._cursor.calls[0][1]
    second = conn._cursor.calls[1][1]
    assert first[1] == second[1] == f"transaction:{tx.id}"
    assert first[5] == second[5] == str(tx.entity_id)


def test_postgres_style_adapter_failure_is_not_silently_swallowed():
    """The production engine must let the store transaction roll back."""
    class FailingAdapter(PebKeychainsAdapter):
        def emit_transaction(self, connection, transaction):
            raise RuntimeError("resolution outbox unavailable")

    class StoreWithConnection:
        def __init__(self):
            self.transactions = []
            self.connection = _Connection()

        def transaction(self):
            from contextlib import contextmanager

            @contextmanager
            def boundary():
                before = list(self.transactions)
                try:
                    yield
                except Exception:
                    self.transactions[:] = before
                    raise
            return boundary()

        def list_states(self):
            return []

        def latest_decision(self):
            return None

        def save_transaction(self, transaction):
            self.transactions.append(transaction)
            return transaction

        def _connection(self):
            return self.connection

    from peb_kernel.engine import PebGovernanceEngine

    store = StoreWithConnection()
    engine = PebGovernanceEngine(store, keychains_adapter=FailingAdapter())
    transaction = PebTransaction(
        idempotency_key="atomic-failure",
        entity_id="entity-1",
        tool_name="peb_record_decision",
        input={},
    )

    import pytest
    with pytest.raises(RuntimeError, match="outbox unavailable"):
        engine.process_for_path(transaction)
    assert store.transactions == []
