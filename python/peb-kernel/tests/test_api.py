from __future__ import annotations

from uuid import uuid4

from peb_kernel.api import AdmissionController
from peb_kernel.domain import PebDecision, PebState, PebStateHash
from peb_kernel.engine import PebGovernanceEngine
from peb_kernel.hashing import PebHashService
from peb_kernel.store import InMemoryPebStore


def controller():
    return AdmissionController(PebGovernanceEngine(InMemoryPebStore()))


def state(key: str, checksum: str) -> PebState:
    return PebState(key=key, content={}, checksum=checksum, id=uuid4())


def payload(tool="peb_validate_transition", input_payload=None):
    return {
        "idempotencyKey": f"id-{tool}",
        "entityId": "api-test",
        "toolName": tool,
        "input": {} if input_payload is None else input_payload,
    }


def test_valid_transaction_returns_contract_response():
    result = controller().submit_transaction(payload())
    assert result.status_code == 200
    # W1.12: response is now PebAdmissionResult (envelope-aware)
    assert result.body["message"] == "Validation processed"
    assert result.body["admitted"] is True
    assert result.body["admission_result"] == "ALLOWED"
    assert "transaction_id" in result.body
    assert "envelope_id" in result.body
    assert "evaluation_fingerprint" in result.body


def test_missing_persistence_fields_returns_400():
    body = payload()
    body.pop("entityId")
    result = controller().submit_transaction(body)
    assert result.status_code == 400
    assert "entityId" in result.body["message"]


def test_blank_entity_is_malformed_at_boundary():
    body = payload()
    body["entityId"] = " "
    result = controller().submit_transaction(body)
    assert result.status_code == 400
    assert "entityId" in result.body["message"]


def test_malformed_violation_returns_422_and_no_partial_write():
    store = InMemoryPebStore()
    controller_instance = AdmissionController(PebGovernanceEngine(store))
    result = controller_instance.submit_transaction(
        payload("peb_report_violation", {"severity": "hard"})
    )
    assert result.status_code == 422
    assert "violation_type" in result.body["message"]
    assert store.transactions == []


def test_envelope_refs_are_carried_through_to_response():
    """W1.12: when a request carries envelope_id + evaluation_fingerprint,
    the PebAdmissionResult response must carry them through."""
    env_id = "11111111-2222-4333-8444-555555555555"
    fp = "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
    body = payload()
    body["envelope_id"] = env_id
    body["evaluation_fingerprint"] = fp
    result = controller().submit_transaction(body)
    assert result.status_code == 200
    assert result.body["envelope_id"] == env_id
    assert result.body["evaluation_fingerprint"] == fp
    assert result.body["admitted"] is True


def test_envelope_refs_absent_when_not_provided():
    """W1.12: when no envelope refs are provided, the response carries null."""
    result = controller().submit_transaction(payload())
    assert result.status_code == 200
    assert result.body["envelope_id"] is None
    assert result.body["evaluation_fingerprint"] is None


# ── GET /api/v1/peb/state/hash ──────────────────────────────────────────


def test_state_hash_empty_store_matches_contract_shape():
    result = controller().state_hash()
    assert result.status_code == 200
    assert set(result.body) == {
        "peb_state_hash",
        "document_hashes",
        "last_decision_hash",
        "thought_context_hash",
        "cognitive_mode",
    }
    assert result.body["peb_state_hash"] == PebStateHash.compute("empty").value
    assert result.body["document_hashes"] == {}
    assert result.body["last_decision_hash"] == ""
    assert result.body["cognitive_mode"] == "operational"


def test_state_hash_reflects_states_and_latest_decision():
    store = InMemoryPebStore()
    store.save_state(state("invariants", "c1"))
    store.save_state(state("architecture", "c2"))
    decision = PebDecision(
        title="decision", author_id="engineer", transaction_id=uuid4(), after_hash="d" * 64
    )
    store.save_decision(decision)
    result = AdmissionController(PebGovernanceEngine(store)).state_hash()
    assert result.status_code == 200
    assert result.body["document_hashes"] == {"architecture": "c2", "invariants": "c1"}
    assert result.body["last_decision_hash"] == "d" * 64
    expected_root = PebHashService().compute_system_hash(
        [state("architecture", "c2"), state("invariants", "c1")], decision
    ).value
    assert result.body["peb_state_hash"] == expected_root
    expected_context = PebStateHash.compute(f"{expected_root}:{'d' * 64}").value
    assert result.body["thought_context_hash"] == expected_context


def test_state_hash_document_hashes_keys_are_sorted():
    store = InMemoryPebStore()
    store.save_state(state("zebra", "z"))
    store.save_state(state("alpha", "a"))
    result = AdmissionController(PebGovernanceEngine(store)).state_hash()
    assert list(result.body["document_hashes"].keys()) == ["alpha", "zebra"]
