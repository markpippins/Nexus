package org.nexus.peb.core.engine;

import org.nexus.peb.core.transaction.PebTransactionEngine;
import org.nexus.peb.core.validation.InvariantValidator;
import org.nexus.peb.core.violation.PebViolationEngine;
import org.nexus.peb.domain.entity.PebTransaction;
import org.nexus.peb.domain.enums.AdmissionPath;
import org.nexus.peb.domain.enums.AdmissionResult;
import org.nexus.peb.domain.dto.AdmissionResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * PEB Governance Engine — policy authoring and audit.
 *
 * <p>PEB is the policy authoring layer, NOT the enforcement gate.
 * It defines what rules <em>should</em> apply to transitions. The
 * PostgreSQL Semantic Kernel enforces those rules via its
 * {@code trg_authorize_transition} trigger, which reads from the
 * {@code policy_rule} table (compiled from CUE).
 *
 * <p><b>This engine does NOT call {@code kernel.sys_transition()}.</b>
 * The kernel is the single authority on state transitions. PEB's job
 * is to compile policy into SQL predicates that the kernel evaluates.
 * See: {@code migration 010} and the {@code policy_rule} table.
 *
 * <p>The methods here record PEB's own audit trail — which policy
 * was evaluated, what it decided, which capability tokens were checked.
 * The kernel event log is the canonical record; PEB's audit is a
 * domain-specific projection for governance analytics.
 */
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
     * {@code peb.violations} — runs in ONE database transaction.
     */
    @Transactional
    public AdmissionResponse processForPath(PebTransaction request, AdmissionPath path) {
        boolean bypassValidator = (path == AdmissionPath.REPORT_VIOLATION);
        boolean validatorPassed = bypassValidator || validator.validate(request);

        request.setAdmissionResult(
            (bypassValidator || !validatorPassed) ? AdmissionResult.REJECTED
                                                 : path.defaultAdmissionResult()
        );

        PebTransaction tx = transactionEngine.beginTransaction(request);
        transactionEngine.commitTransaction(tx);

        if (bypassValidator) {
            violationEngine.ingest(tx);
            return AdmissionResponse.accepted("Violation recorded as REJECTED");
        }
        if (validatorPassed) {
            String message = switch (path) {
                case VALIDATE -> "Validation processed";
                case MUTATE   -> "Mutation processed";
                case UNKNOWN  -> "Routed (unknown tool)";
                default       -> "Transaction processed";
            };
            return AdmissionResponse.accepted(message);
        }
        return AdmissionResponse.denied("Admission denied by invariant validator");
    }
}
