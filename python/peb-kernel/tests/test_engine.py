from __future__ import annotations

from typing import Any

import pytest

from peb_kernel.domain import AdmissionPath, AdmissionResult, PebTransaction
from peb_kernel.engine import PebGovernanceEngine
from peb_kernel.store import InMemoryPebStore


def transaction(tool: str, input_payload: Any | None = None) -> PebTransaction:
    return PebTransaction(
        idempotency_key=f"key-{tool}",
        entity_id="test-entity",
        tool_name=tool,
        input={} if input_payload is None else input_payload,
    )


def test_validate_and_mutate_paths_write_committed_audit_rows():
    store = InMemoryPebStore()
    engine = PebGovernanceEngine(store)

    validate = transaction("peb_validate_transition")
    response = engine.process_for_path(validate)
    assert response.admitted is True
    assert response.message == "Validation processed"
    assert validate.admission_result is AdmissionResult.ALLOWED
    assert validate.committed_at is not None
    assert validate.before_hash is not None
    assert validate.after_hash is not None

    mutate = transaction("peb_record_decision")
    response = engine.process_for_path(mutate)
    assert response.admitted is True
    assert mutate.admission_result is AdmissionResult.ALLOWED
    assert len(store.transactions) == 2


def test_unknown_tool_is_recorded_as_rejected_by_structural_validator():
    store = InMemoryPebStore()
    request = transaction("unknown_tool")
    response = PebGovernanceEngine(store).process_for_path(request)
    assert response.admitted is False
    assert request.admission_result is AdmissionResult.REJECTED
    assert len(store.transactions) == 1


def test_report_violation_bypasses_validator_and_persists_first_class_row():
    store = InMemoryPebStore()
    request = transaction(
        "peb_report_violation",
        {
            "violation_type": "rcl_violation",
            "severity": "soft",
            "capability_attempted": "cap:mutate_state",
            "context": {"source": "test"},
        },
    )
    response = PebGovernanceEngine(store).process_for_path(request)
    assert response.admitted is True
    assert request.admission_result is AdmissionResult.REJECTED
    assert len(store.violations) == 1
    assert store.violations[0].violation_type.value == "RCL"
    assert store.violations[0].resolution.value == "REJECTED"


def test_malformed_violation_rolls_back_audit_row():
    store = InMemoryPebStore()
    request = transaction("peb_report_violation", {"severity": "hard"})
    with pytest.raises(Exception, match="violation_type"):
        PebGovernanceEngine(store).process_for_path(request)
    assert store.transactions == []
    assert store.violations == []


def test_invalid_structural_request_is_still_audited():
    store = InMemoryPebStore()
    request = transaction("peb_validate_transition")
    request.entity_id = " "
    response = PebGovernanceEngine(store).process_for_path(request)
    assert response.admitted is False
    assert request.admission_result is AdmissionResult.REJECTED
    assert len(store.transactions) == 1


def test_adapter_failures_do_not_rollback_committed_governance_event():
    class FailingConduit:
        def issue_receipt(self, receipt):
            raise RuntimeError("conduit down")

    store = InMemoryPebStore()
    request = transaction("peb_record_decision")
    response = PebGovernanceEngine(store, conduit_adapter=FailingConduit()).process_for_path(request)
    assert response.admitted is True
    assert len(store.transactions) == 1
