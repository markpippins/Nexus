"""PEB governance orchestration."""

from __future__ import annotations

import logging
from typing import Any, Mapping
from uuid import UUID, uuid4

from .domain import (
    AdmissionPath,
    AdmissionResponse,
    AdmissionResult,
    ExecutionClaimAdmission,
    PebTransaction,
    PebViolation,
    ViolationResolution,
    ViolationSeverity,
    ViolationType,
    MalformedAdmissionRequest,
    utc_now,
)
from .hashing import PebHashService
from .ports import ConduitMcpPort, LosmIrTransitionPort, PebStore, ResolutionExecutionClaimPort

log = logging.getLogger(__name__)


class InvariantValidator:
    """Structural validator; policy authorization remains outside PEB."""

    def validate(self, transaction: PebTransaction | None) -> bool:
        if transaction is None:
            log.warning("InvariantValidator: rejecting null transaction")
            return False
        if not transaction.tool_name or not transaction.tool_name.strip():
            log.warning("InvariantValidator: rejecting blank toolName")
            return False
        if AdmissionPath.from_tool_name(transaction.tool_name) is AdmissionPath.UNKNOWN:
            log.warning("InvariantValidator: rejecting unknown toolName %r", transaction.tool_name)
            return False
        if not transaction.entity_id or not transaction.entity_id.strip():
            log.warning("InvariantValidator: rejecting blank entityId")
            return False
        if transaction.input is None:
            log.warning("InvariantValidator: rejecting null input")
            return False
        return True


class PebTransactionEngine:
    def __init__(self, store: PebStore, hash_service: PebHashService | None = None) -> None:
        self.store = store
        self.hash_service = hash_service or PebHashService()

    def begin_transaction(self, transaction: PebTransaction) -> PebTransaction:
        if transaction.before_hash is None:
            transaction.before_hash = self.hash_service.compute_system_hash(
                self.store.list_states(), self.store.latest_decision()
            ).value
        return self.store.save_transaction(transaction)

    def commit_transaction(self, transaction: PebTransaction) -> PebTransaction:
        transaction.committed_at = utc_now()
        if transaction.after_hash is None:
            transaction.after_hash = self.hash_service.compute_system_hash(
                self.store.list_states(), self.store.latest_decision()
            ).value
        return self.store.save_transaction(transaction)


class PebViolationEngine:
    def __init__(self, store: PebStore) -> None:
        self.store = store

    def ingest(self, transaction: PebTransaction) -> PebViolation:
        if not isinstance(transaction.input, Mapping):
            raise MalformedAdmissionRequest(
                "peb_report_violation requires a non-null input payload"
            )
        input_payload = transaction.input
        violation_type = input_payload.get("violation_type")
        severity = input_payload.get("severity")
        if not isinstance(violation_type, str):
            raise MalformedAdmissionRequest(
                "peb_report_violation requires a textual 'violation_type' field"
            )
        if not isinstance(severity, str):
            raise MalformedAdmissionRequest(
                "peb_report_violation requires a textual 'severity' field"
            )
        violation = PebViolation(
            transaction_id=transaction.id,
            violation_type=ViolationType.from_mcp_value(violation_type),
            severity=ViolationSeverity.from_mcp_value(severity),
            entity_id=transaction.entity_id,
            capability_attempted=(
                input_payload.get("capability_attempted")
                if isinstance(input_payload.get("capability_attempted"), str)
                else None
            ),
            context=dict(input_payload),
            resolution=ViolationResolution.REJECTED,
        )
        return self.store.save_violation(violation)

    def record_execution_admission_rejection(
        self, transaction: PebTransaction, reason: str | None
    ) -> PebViolation:
        """Record a rejected execution-claim admission as a first-class authority
        violation. This path is intentionally separate from ingest: the worker
        does not get to choose whether its own claim is a violation, and the
        kernel preserves the rejection reason in the violation context.
        """
        violation = PebViolation(
            id=uuid4(),
            transaction_id=transaction.id,
            violation_type=ViolationType.AUTHORITY_LEAKAGE,
            severity=ViolationSeverity.HARD,
            entity_id=transaction.entity_id,
            capability_attempted="execution_claim_admission",
            context={"reason": reason or "UNKNOWN", "input": transaction.input},
            resolution=ViolationResolution.REJECTED,
        )
        return self.store.save_violation(violation)

    def record_capability_rejection(
        self, transaction: PebTransaction, reason: str
    ) -> PebViolation:
        """Record an admission denied by the capability registry gate."""
        declared = (
            transaction.input.get("capability_attempted")
            if isinstance(transaction.input, Mapping)
            else None
        )
        violation = PebViolation(
            id=uuid4(),
            transaction_id=transaction.id,
            violation_type=ViolationType.AUTHORITY_LEAKAGE,
            severity=ViolationSeverity.HARD,
            entity_id=transaction.entity_id,
            capability_attempted=declared if isinstance(declared, str) else "unknown",
            context={"reason": reason, "input": transaction.input},
            resolution=ViolationResolution.REJECTED,
        )
        return self.store.save_violation(violation)


class PebGovernanceEngine:
    """Coordinates validation, audit persistence, violation persistence, and notifications."""

    def __init__(
        self,
        store: PebStore,
        validator: InvariantValidator | None = None,
        transaction_engine: PebTransactionEngine | None = None,
        violation_engine: PebViolationEngine | None = None,
        conduit_adapter: ConduitMcpPort | None = None,
        losm_adapter: LosmIrTransitionPort | None = None,
        resolution_claim_adapter: ResolutionExecutionClaimPort | None = None,
    ) -> None:
        self.store = store
        self.validator = validator or InvariantValidator()
        self.transaction_engine = transaction_engine or PebTransactionEngine(store)
        self.violation_engine = violation_engine or PebViolationEngine(store)
        self.conduit_adapter = conduit_adapter
        self.losm_adapter = losm_adapter
        self.resolution_claim_adapter = resolution_claim_adapter

    def process(self, request: PebTransaction) -> None:
        if self.validator.validate(request):
            with self.store.transaction():
                transaction = self.transaction_engine.begin_transaction(request)
                self.transaction_engine.commit_transaction(transaction)

    def process_for_path(
        self, request: PebTransaction, path: AdmissionPath | None = None
    ) -> AdmissionResponse:
        path = path or AdmissionPath.from_tool_name(request.tool_name)
        bypass_validator = path is AdmissionPath.REPORT_VIOLATION
        validator_passed = bypass_validator or self.validator.validate(request)
        carries_execution_claim = self._carries_execution_claim(request)
        execution_admission_reason: str | None = None
        execution_admission_passed = True

        if validator_passed and carries_execution_claim:
            # Assign the PEB identity before resolution admission so the
            # resolution-side receipt is correlated to the exact transaction
            # that will be persisted below.
            request.on_create()

        request.admission_result = (
            AdmissionResult.REJECTED
            if bypass_validator or not validator_passed
            else path.default_admission_result()
        )

        with self.store.transaction():
            transaction = self.transaction_engine.begin_transaction(request)

            if validator_passed and carries_execution_claim:
                if self.resolution_claim_adapter is None:
                    execution_admission_passed = False
                    execution_admission_reason = "RESOLUTION_ADMISSION_UNAVAILABLE"
                else:
                    assert transaction.id is not None  # set by on_create() above
                    assessment = self.resolution_claim_adapter.admit_verified_execution_claim(
                        transaction.id, transaction.input
                    )
                    execution_admission_passed = assessment.admitted
                    execution_admission_reason = assessment.reason

                if not execution_admission_passed:
                    transaction.admission_result = AdmissionResult.REJECTED
                    self.violation_engine.record_execution_admission_rejection(
                        transaction, execution_admission_reason
                    )

            capability_denial_reason = self._capability_gate(request)
            capability_denied = False
            if capability_denial_reason is not None and transaction.admission_result != AdmissionResult.REJECTED:
                transaction.admission_result = AdmissionResult.REJECTED
                capability_denied = True
                self.violation_engine.record_capability_rejection(transaction, capability_denial_reason)

            # Kernel linkage (V4__kernel_semantic_kernel_link): every governance
            # decision is recorded as a kernel transition event and correlated
            # onto the persisted transaction. Best-effort — a kernel-side
            # failure degrades to the legacy NULL-linkage state with a logged
            # warning rather than blocking admission.
            try:
                self.store.record_kernel_event(transaction)
            except Exception:
                log.warning(
                    "Kernel event linkage failed for transaction %s",
                    transaction.id,
                    exc_info=True,
                )

            self.transaction_engine.commit_transaction(transaction)
            if bypass_validator:
                self.violation_engine.ingest(transaction)

        self._notify_adapters(transaction, path)
        if bypass_validator:
            return AdmissionResponse.accepted("Violation recorded as REJECTED")
        if not validator_passed:
            return AdmissionResponse.denied("Admission denied by invariant validator")
        if not execution_admission_passed:
            return AdmissionResponse.denied(
                f"Execution claim admission denied: {execution_admission_reason}"
            )
        if capability_denied:
            return AdmissionResponse.denied(
                f"Admission denied by capability registry: {capability_denial_reason}"
            )
        if validator_passed:
            message = {
                AdmissionPath.VALIDATE: "Validation processed",
                AdmissionPath.MUTATE: "Mutation processed",
                AdmissionPath.UNKNOWN: "Routed (unknown tool)",
            }.get(path, "Transaction processed")
            return AdmissionResponse.accepted(message)
        return AdmissionResponse.denied("Admission denied by invariant validator")

    @staticmethod
    def _carries_execution_claim(request: PebTransaction) -> bool:
        return (
            request is not None
            and isinstance(request.input, Mapping)
            and isinstance(request.input.get("execution_claim"), Mapping)
        )

    def _capability_gate(self, request: PebTransaction) -> str | None:
        """Consult the capability registry when it is populated.

        Enforcement policy (increment 1, to-do de9585fa):
          - empty registry → no gating (admission behaviour unchanged);
          - a transaction that DECLARES ``capability_attempted`` which is not
            an active registered capability → denied with an authority
            violation.
        Undeclared capabilities are logged but not yet denied — mandatory
        capability declarations need an architect ruling before they can gate
        live traffic.
        """
        try:
            with self.store.transaction():
                registered = self.store.list_capabilities()
        except Exception:
            log.warning("Capability registry read failed; skipping gate", exc_info=True)
            return None
        # Empty registry → admission behaviour unchanged (opt-in enforcement).
        if not registered or not isinstance(request.input, Mapping):
            return None
        active = {c.capability for c in registered if c.active}
        declared = request.input.get("capability_attempted")
        if not isinstance(declared, str) or not declared:
            return None
        if declared in active:
            return None
        return f"CAPABILITY_NOT_GRANTED:{declared}"

    def _notify_adapters(self, transaction: PebTransaction, path: AdmissionPath) -> None:
        if self.conduit_adapter is not None and path is not AdmissionPath.UNKNOWN:
            receipt = {
                "eventId": str(transaction.id),
                "eventType": "peb.transaction.committed",
                "toolName": transaction.tool_name,
                "admissionResult": transaction.admission_result.value if transaction.admission_result else None,
                "entityId": transaction.entity_id,
            }
            try:
                self.conduit_adapter.issue_receipt(receipt)
            except Exception:  # adapters are explicitly best effort
                log.warning("Failed to notify conduit-mcp for transaction %s", transaction.id, exc_info=True)

        if self.losm_adapter is not None and path is AdmissionPath.MUTATE:
            try:
                self.losm_adapter.transition(
                    str(transaction.id),
                    "PEB_COMMITTED",
                    "peb-kernel",
                    f"Transaction committed: {transaction.tool_name}",
                )
            except Exception:
                log.warning("Failed to notify LOSM for transaction %s", transaction.id, exc_info=True)
