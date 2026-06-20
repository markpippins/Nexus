package org.nexus.peb.core.engine;

import org.nexus.peb.core.transaction.PebTransactionEngine;
import org.nexus.peb.core.validation.InvariantValidator;
import org.nexus.peb.core.violation.PebViolationEngine;
import org.nexus.peb.domain.entity.PebTransaction;
import org.nexus.peb.domain.enums.AdmissionPath;
import org.nexus.peb.domain.enums.AdmissionResult;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PebGovernanceEngine {

    private final PebTransactionEngine transactionEngine;
    private final InvariantValidator validator;
    private final PebViolationEngine violationEngine;

    public PebGovernanceEngine(PebTransactionEngine transactionEngine,
                               InvariantValidator validator,
                               PebViolationEngine violationEngine) {
        this.transactionEngine = transactionEngine;
        this.validator = validator;
        this.violationEngine = violationEngine;
    }

    /**
     * Original undispatched entry point. Kept for back-compat with anything
     * outside the MCP facade that may submit a raw PebTransaction.
     *
     * Wrapped in {@link Transactional} so the beginTransaction + commitTransaction
     * pair joins a single transaction — the inner {@code @Transactional} methods
     * propagate as REQUIRED and join this scope.
     */
    @Transactional
    public void process(PebTransaction request) {
        if (validator.validate(request)) {
            PebTransaction tx = transactionEngine.beginTransaction(request);
            // Process logic
            transactionEngine.commitTransaction(tx);
        }
    }

    /**
     * Routes a transaction through the admission path implied by its MCP tool
     * name. Reports the result text the controller hands back to the caller.
     *
     * For REPORT_VIOLATION the invariant validator is intentionally bypassed:
     * if a violation report passed invariants we wouldn't be reporting it.
     * For all other paths we honour the validator.
     *
     * Wrapped in {@link Transactional} so the full dispatch — validator, audit
     * save in {@code peb.transactions}, and first-class violation save in
     * {@code peb.violations} — runs in ONE database transaction. Any
     * RuntimeException (validator failure, malformed REPORT_VIOLATION, DB
     * connection loss, idempotency-key collision) rolls back ALL writes, so
     * the audit row never exists without a paired violation row, and a
     * malformed violation report never leaves an audit-only orphan row.
     */
    @Transactional
    public String processForPath(PebTransaction request, AdmissionPath path) {
        boolean bypassValidator = (path == AdmissionPath.REPORT_VIOLATION);
        boolean validatorPassed = bypassValidator || validator.validate(request);

        // Audit trail is always written so a denied or unknown-path request still
        // leaves a row in peb.transactions. admission_result is REJECTED for
        // REPORT_VIOLATION and for any validator denial; otherwise it falls back
        // to the path's default (ALLOWED for VALIDATE/MUTATE, ROUTED for UNKNOWN).
        request.setAdmissionResult(
            (bypassValidator || !validatorPassed) ? AdmissionResult.REJECTED
                                                 : path.defaultAdmissionResult()
        );

        PebTransaction tx = transactionEngine.beginTransaction(request);
        transactionEngine.commitTransaction(tx);

        if (bypassValidator) {
            // First-class violation row: structured columns alongside the
            // JsonNode snapshot already on peb.transactions. Throws
            // IllegalArgumentException on a malformed violation_type/severity,
            // which the controller surfaces as a 4xx to the MCP client.
            violationEngine.ingest(tx);
            return "Violation recorded as REJECTED";
        }
        if (validatorPassed) {
            switch (path) {
                case VALIDATE:           return "Validation processed";
                case MUTATE:             return "Mutation processed";
                case UNKNOWN:            return "Routed (unknown tool)";
                default:                 return "Transaction processed";
            }
        }
        return "Admission denied by invariant validator";
    }
}
