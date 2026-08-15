"""PEB governance orchestration."""

from __future__ import annotations

import logging
from typing import Any, Mapping

from .domain import (
    AdmissionPath,
    AdmissionResponse,
    AdmissionResult,
    PebTransaction,
    PebViolation,
    ViolationResolution,
    ViolationSeverity,
    ViolationType,
    MalformedAdmissionRequest,
    utc_now,
)
from .hashing import PebHashService
from .ports import ConduitMcpPort, LosmIrTransitionPort, PebStore

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
    ) -> None:
        self.store = store
        self.validator = validator or InvariantValidator()
        self.transaction_engine = transaction_engine or PebTransactionEngine(store)
        self.violation_engine = violation_engine or PebViolationEngine(store)
        self.conduit_adapter = conduit_adapter
        self.losm_adapter = losm_adapter

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
        request.admission_result = (
            AdmissionResult.REJECTED
            if bypass_validator or not validator_passed
            else path.default_admission_result()
        )

        with self.store.transaction():
            transaction = self.transaction_engine.begin_transaction(request)
            self.transaction_engine.commit_transaction(transaction)
            if bypass_validator:
                self.violation_engine.ingest(transaction)

        self._notify_adapters(transaction, path)
        if bypass_validator:
            return AdmissionResponse.accepted("Violation recorded as REJECTED")
        if validator_passed:
            message = {
                AdmissionPath.VALIDATE: "Validation processed",
                AdmissionPath.MUTATE: "Mutation processed",
                AdmissionPath.UNKNOWN: "Routed (unknown tool)",
            }.get(path, "Transaction processed")
            return AdmissionResponse.accepted(message)
        return AdmissionResponse.denied("Admission denied by invariant validator")

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
