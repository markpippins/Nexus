"""Execution-claim admission gate tests.

Mirrors the JVM ``ExecutionClaimAdmissionGateTest`` to verify that the Python
``PebGovernanceEngine`` applies the same fail-closed semantics when a
transaction carries an ``execution_claim`` envelope.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest

from peb_kernel.domain import (
    AdmissionPath,
    AdmissionResult,
    ExecutionClaimAdmission,
    PebTransaction,
)
from peb_kernel.engine import PebGovernanceEngine, PebViolationEngine
from peb_kernel.store import InMemoryPebStore


class FakeResolutionPort:
    """In-process stand-in for the resolution admission port."""

    def __init__(self, result: ExecutionClaimAdmission) -> None:
        self.result = result
        self.transaction_id: UUID | None = None

    def admit_verified_execution_claim(
        self, peb_transaction_id: UUID | None, input: Any | None
    ) -> ExecutionClaimAdmission:
        self.transaction_id = peb_transaction_id
        return self.result


class RecordingViolationEngine(PebViolationEngine):
    """Captures the rejection reason so tests can assert on it."""

    def __init__(self) -> None:
        super().__init__(InMemoryPebStore())
        self.reason: str | None = None
        self.rejection_violation = None

    def record_execution_admission_rejection(
        self, transaction: PebTransaction, reason: str | None
    ):
        self.reason = reason
        self.rejection_violation = super().record_execution_admission_rejection(
            transaction, reason
        )
        return self.rejection_violation


def _execution_transaction() -> PebTransaction:
    """Build a MUTATE transaction carrying an execution-claim envelope."""
    return PebTransaction(
        idempotency_key=str(uuid4()),
        entity_id="execution-claim-test",
        tool_name="peb_record_decision",
        input={
            "execution_claim": {"resolution_claim_id": str(uuid4())},
            "execution_evidence": {"resolution_evidence_id": str(uuid4())},
        },
    )


def _engine(
    resolution: ResolutionExecutionClaimPort | None,
    violations: RecordingViolationEngine,
) -> PebGovernanceEngine:
    store = InMemoryPebStore()
    return PebGovernanceEngine(
        store=store,
        violation_engine=violations,
        resolution_claim_adapter=resolution,
    )


# ---------------------------------------------------------------------------
# Approved evidence allows the transaction
# ---------------------------------------------------------------------------


def test_approved_evidence_allows_transaction():
    resolution = FakeResolutionPort(
        ExecutionClaimAdmission.admitted_claim(
            "verified Git evidence is eligible for PEB admission", uuid4()
        )
    )
    transaction = _execution_transaction()
    engine = _engine(resolution, RecordingViolationEngine())

    response = engine.process_for_path(transaction, AdmissionPath.MUTATE)

    assert response.admitted is True
    assert transaction.admission_result is AdmissionResult.ALLOWED
    assert resolution.transaction_id == transaction.id


# ---------------------------------------------------------------------------
# Rejected evidence records REJECTED + authority-leakage violation
# ---------------------------------------------------------------------------


def test_rejected_evidence_rejects_and_records_violation():
    resolution = FakeResolutionPort(
        ExecutionClaimAdmission.rejected("EVIDENCE_NOT_INDEPENDENTLY_VERIFIED")
    )
    violations = RecordingViolationEngine()
    transaction = _execution_transaction()
    engine = _engine(resolution, violations)

    response = engine.process_for_path(transaction, AdmissionPath.MUTATE)

    assert response.admitted is False
    assert "EVIDENCE_NOT_INDEPENDENTLY_VERIFIED" in response.message
    assert transaction.admission_result is AdmissionResult.REJECTED
    assert violations.reason == "EVIDENCE_NOT_INDEPENDENTLY_VERIFIED"
    assert violations.rejection_violation is not None
    assert violations.rejection_violation.violation_type.value == "AUTHORITY_LEAKAGE"
    assert violations.rejection_violation.severity.value == "HARD"
    assert violations.rejection_violation.capability_attempted == "execution_claim_admission"
    assert violations.rejection_violation.resolution.value == "REJECTED"


# ---------------------------------------------------------------------------
# Missing resolution adapter fails closed
# ---------------------------------------------------------------------------


def test_missing_resolution_adapter_fails_closed():
    violations = RecordingViolationEngine()
    transaction = _execution_transaction()
    engine = _engine(None, violations)

    response = engine.process_for_path(transaction, AdmissionPath.MUTATE)

    assert response.admitted is False
    assert transaction.admission_result is AdmissionResult.REJECTED
    assert violations.reason == "RESOLUTION_ADMISSION_UNAVAILABLE"


# ---------------------------------------------------------------------------
# Malformed envelope (missing execution_claim) is rejected by the adapter
# ---------------------------------------------------------------------------


def test_missing_execution_claim_envelope_is_rejected():
    resolution = FakeResolutionPort(
        ExecutionClaimAdmission.admitted_claim("should not be called", uuid4())
    )
    violations = RecordingViolationEngine()
    store = InMemoryPebStore()
    engine = PebGovernanceEngine(
        store=store,
        violation_engine=violations,
        resolution_claim_adapter=resolution,
    )

    transaction = PebTransaction(
        idempotency_key=str(uuid4()),
        entity_id="malformed-test",
        tool_name="peb_record_decision",
        input={"not_an_execution_claim": True},
    )

    response = engine.process_for_path(transaction, AdmissionPath.MUTATE)

    # No execution_claim key means the engine does not invoke resolution at all.
    # The transaction passes the invariant validator and is admitted normally.
    assert response.admitted is True
    assert resolution.transaction_id is None


# ---------------------------------------------------------------------------
# Unavailable resolution (adapter DB unreachable) fails closed
# ---------------------------------------------------------------------------


def test_adapter_fails_closed_when_resolution_db_unavailable():
    """The ResolutionExecutionClaimAdapter must catch DB errors and return
    rejected(RESOLUTION_ADMISSION_UNAVAILABLE), never raising."""
    from peb_kernel.adapters import ResolutionExecutionClaimAdapter

    adapter = ResolutionExecutionClaimAdapter(dsn="postgresql://invalid:invalid@nonexistent:5432/nexus")
    result = adapter.admit_verified_execution_claim(
        uuid4(),
        {
            "execution_claim": {"resolution_claim_id": str(uuid4())},
            "execution_evidence": {
                "resolution_evidence_id": str(uuid4()),
                "policy_version_hash": "sha256:abc",
                "lease_id": "lease-1",
                "grant_id": "grant-1",
                "attempt_id": "attempt-1",
            },
        },
    )
    assert result.admitted is False
    assert result.reason == "RESOLUTION_ADMISSION_UNAVAILABLE"


# ---------------------------------------------------------------------------
# Non-execution-claim transactions bypass resolution entirely
# ---------------------------------------------------------------------------


def test_non_claim_transaction_does_not_invoke_resolution():
    resolution = FakeResolutionPort(
        ExecutionClaimAdmission.admitted_claim("should not be called", uuid4())
    )
    violations = RecordingViolationEngine()
    store = InMemoryPebStore()
    engine = PebGovernanceEngine(
        store=store,
        violation_engine=violations,
        resolution_claim_adapter=resolution,
    )

    transaction = PebTransaction(
        idempotency_key=str(uuid4()),
        entity_id="no-claim-test",
        tool_name="peb_record_decision",
        input={"decision": "approve"},
    )

    response = engine.process_for_path(transaction, AdmissionPath.MUTATE)

    assert response.admitted is True
    assert resolution.transaction_id is None


# ---------------------------------------------------------------------------
# Violation context preserves the rejection reason and input
# ---------------------------------------------------------------------------


def test_rejection_violation_context_preserves_reason_and_input():
    resolution = FakeResolutionPort(
        ExecutionClaimAdmission.rejected("CLAIM_DISPOSITION_REJECTED")
    )
    violations = RecordingViolationEngine()
    transaction = _execution_transaction()
    engine = _engine(resolution, violations)

    engine.process_for_path(transaction, AdmissionPath.MUTATE)

    ctx = violations.rejection_violation.context
    assert ctx["reason"] == "CLAIM_DISPOSITION_REJECTED"
    assert ctx["input"] == transaction.input
