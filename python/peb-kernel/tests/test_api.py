from __future__ import annotations

from peb_kernel.api import AdmissionController
from peb_kernel.engine import PebGovernanceEngine
from peb_kernel.store import InMemoryPebStore


def controller():
    return AdmissionController(PebGovernanceEngine(InMemoryPebStore()))


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
    assert result.body == {"message": "Validation processed", "admitted": True}


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
