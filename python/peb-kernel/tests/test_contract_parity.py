from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from peb_kernel.domain import AdmissionPath, AdmissionResult, PebTransaction
from peb_kernel.engine import PebGovernanceEngine
from peb_kernel.store import InMemoryPebStore


VALIDATION_TOOLS = (
    "peb_validate_transition",
    "peb_check_invariants",
    "peb_validate_transform",
)
MUTATION_TOOLS = (
    "peb_record_decision",
    "peb_append_trace_segment",
    "peb_request_clarification",
    "peb_extension_proposal",
)


def make_transaction(tool_name: str, payload: Any | None = None) -> PebTransaction:
    return PebTransaction(
        idempotency_key=f"parity-{tool_name}",
        entity_id="contract-test",
        tool_name=tool_name,
        input={} if payload is None else payload,
    )


def test_typespec_request_preserves_optional_id() -> None:
    transaction = PebTransaction.from_payload(
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "idempotencyKey": "parity-with-id",
            "entityId": "contract-test",
            "toolName": "peb_validate_transition",
            "input": {"from_state": "a", "to_state": "b"},
        }
    )
    assert str(transaction.id) == "00000000-0000-0000-0000-000000000001"


@pytest.mark.parametrize("tool_name", VALIDATION_TOOLS)
def test_typespec_validate_tools_are_allowed(tool_name: str) -> None:
    transaction = make_transaction(tool_name)
    assert AdmissionPath.from_tool_name(tool_name) is AdmissionPath.VALIDATE
    response = PebGovernanceEngine(InMemoryPebStore()).process_for_path(transaction)
    assert response.admitted is True
    assert transaction.admission_result is AdmissionResult.ALLOWED


@pytest.mark.parametrize("tool_name", MUTATION_TOOLS)
def test_typespec_mutation_tools_are_allowed(tool_name: str) -> None:
    transaction = make_transaction(tool_name)
    assert AdmissionPath.from_tool_name(tool_name) is AdmissionPath.MUTATE
    response = PebGovernanceEngine(InMemoryPebStore()).process_for_path(transaction)
    assert response.admitted is True
    assert transaction.admission_result is AdmissionResult.ALLOWED


def test_typespec_report_violation_is_recorded_as_rejected_but_endpoint_succeeds() -> None:
    store = InMemoryPebStore()
    transaction = make_transaction(
        "peb_report_violation",
        {"violation_type": "AUTHORITY_LEAKAGE", "severity": "HARD"},
    )
    assert AdmissionPath.from_tool_name(transaction.tool_name) is AdmissionPath.REPORT_VIOLATION
    response = PebGovernanceEngine(store).process_for_path(transaction)
    assert response.admitted is True
    assert transaction.admission_result is AdmissionResult.REJECTED
    assert len(store.violations) == 1


def test_typespec_unknown_tool_is_routed_by_classifier_but_rejected_by_validator() -> None:
    transaction = make_transaction("not-a-typespec-tool")
    assert AdmissionPath.from_tool_name(transaction.tool_name) is AdmissionPath.UNKNOWN
    response = PebGovernanceEngine(InMemoryPebStore()).process_for_path(transaction)
    assert response.admitted is False
    assert transaction.admission_result is AdmissionResult.REJECTED


def test_typespec_transaction_wire_shape_uses_camel_case_fields() -> None:
    transaction = make_transaction("peb_validate_transition", {"from_state": "a", "to_state": "b"})
    transaction.on_create()
    wire = transaction.to_dict()
    assert set(("idempotencyKey", "entityId", "toolName", "input", "admissionResult")).issubset(wire)
    assert wire["idempotencyKey"] == "parity-peb_validate_transition"
    assert wire["entityId"] == "contract-test"
    assert wire["toolName"] == "peb_validate_transition"


def test_typespec_admission_response_wire_shape_is_shared() -> None:
    transaction = make_transaction("peb_validate_transition")
    response = PebGovernanceEngine(InMemoryPebStore()).process_for_path(transaction)
    assert set(response.to_dict()) == {"message", "admitted"}
    assert isinstance(response.to_dict()["message"], str)
    assert isinstance(response.to_dict()["admitted"], bool)


def test_typespec_admission_response_json_body_has_both_fields() -> None:
    """The TypeSpec PebAdmissionResult model requires {transaction_id,
    envelope_id, evaluation_fingerprint, admission_result, message, admitted}.
    The JVM returns plain text (ResponseEntity<String>); Python returns
    JSON matching the contract. This test pins the Python side to the
    TypeSpec so a regression to plain-text is caught immediately.

    W1.12: the response shape is now PebAdmissionResult (envelope-aware),
    superseding the legacy AdmissionResponse {message, admitted}.
    """
    from peb_kernel.api import AdmissionController

    controller = AdmissionController(PebGovernanceEngine(InMemoryPebStore()))
    result = controller.submit_transaction(
        {"idempotencyKey": "json-test", "entityId": "e", "toolName": "peb_validate_transition", "input": {}}
    )
    assert result.status_code == 200
    # W1.12: PebAdmissionResult shape (supersedes AdmissionResponse)
    expected_keys = {
        "transaction_id", "envelope_id", "evaluation_fingerprint",
        "admission_result", "message", "admitted",
    }
    assert set(result.body.keys()) == expected_keys, f"unexpected keys: {set(result.body.keys())}"
    assert isinstance(result.body["message"], str)
    assert isinstance(result.body["admitted"], bool)
    assert result.body["admitted"] is True
    assert result.body["admission_result"] == "ALLOWED"


def test_typespec_admission_response_denied_body_has_both_fields() -> None:
    """Denied responses must also be JSON with the PebAdmissionResult shape,
    not plain text. W1.12: the response carries envelope refs + admission_result."""
    from peb_kernel.api import AdmissionController

    controller = AdmissionController(PebGovernanceEngine(InMemoryPebStore()))
    result = controller.submit_transaction(
        {"idempotencyKey": "json-deny", "entityId": "e", "toolName": "unknown_tool", "input": {}}
    )
    assert result.status_code == 422
    expected_keys = {
        "transaction_id", "envelope_id", "evaluation_fingerprint",
        "admission_result", "message", "admitted",
    }
    assert set(result.body.keys()) == expected_keys, f"unexpected keys: {set(result.body.keys())}"
    assert result.body["admitted"] is False
    assert result.body["admission_result"] == "REJECTED"


def test_typespec_health_response_matches_peb_health_response_model() -> None:
    """The TypeSpec PebHealthResponse model has {status, database?, schema?,
    catalog?, error?}. Python must not return fields outside that contract
    (e.g. 'backend' was removed to match the model).
    """
    from peb_kernel.store import InMemoryPebStore

    health = InMemoryPebStore().health()
    allowed_keys = {"status", "database", "schema", "catalog", "error"}
    assert set(health.keys()).issubset(allowed_keys)
    assert health["status"] == "UP"
    assert health["database"] == "reachable"
    assert health["schema"] == "peb"


def test_typespec_admission_response_denied_includes_reason_in_message() -> None:
    """Denied execution-claim responses must include the rejection reason in
    the message field so consumers can inspect why admission failed.
    """
    from peb_kernel.domain import ExecutionClaimAdmission
    from peb_kernel.engine import PebGovernanceEngine
    from peb_kernel.store import InMemoryPebStore

    class FakeRejection:
        def admit_verified_execution_claim(self, peb_transaction_id, input):
            return ExecutionClaimAdmission.rejected("EVIDENCE_REJECTED")

    store = InMemoryPebStore()
    engine = PebGovernanceEngine(store, resolution_claim_adapter=FakeRejection())
    transaction = PebTransaction(
        idempotency_key="deny-reason-test",
        entity_id="claim-test",
        tool_name="peb_record_decision",
        input={
            "execution_claim": {"resolution_claim_id": "00000000-0000-0000-0000-000000000001"},
            "execution_evidence": {"resolution_evidence_id": "00000000-0000-0000-0000-000000000002"},
        },
    )
    response = engine.process_for_path(transaction, AdmissionPath.MUTATE)
    assert response.admitted is False
    assert "EVIDENCE_REJECTED" in response.message


def admission_cases() -> list[dict[str, Any]]:
    fixture = Path(__file__).resolve().parents[3] / "typespec/v1/peb-kernel/conformance/admission_cases.json"
    return json.loads(fixture.read_text())


@pytest.mark.parametrize("case", admission_cases(), ids=lambda case: case["name"])
def test_shared_admission_fixture_matches_python_engine(case: dict[str, Any]) -> None:
    transaction = PebTransaction(
        idempotency_key="shared-fixture",
        entity_id=case["entityId"],
        tool_name=case["toolName"],
        input=case["input"],
    )
    path = AdmissionPath.from_tool_name(transaction.tool_name)
    validator_passes = PebGovernanceEngine(InMemoryPebStore()).validator.validate(transaction)
    response = PebGovernanceEngine(InMemoryPebStore()).process_for_path(transaction, path)

    assert path.value == case["expectedPath"]
    assert path.default_admission_result().value == case["defaultAdmissionResult"]
    assert validator_passes is case["validatorPasses"]
    assert transaction.admission_result.value == case["engineAdmissionResult"]
    assert response.admitted is case["admitted"]
    assert response.message == case["message"]
