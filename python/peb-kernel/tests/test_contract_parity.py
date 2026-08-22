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
