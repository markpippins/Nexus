package org.nexus.peb.core.engine;

import org.nexus.peb.core.transaction.PebTransactionEngine;
import org.nexus.peb.core.validation.InvariantValidator;
import org.nexus.peb.core.violation.PebViolationEngine;
import org.nexus.peb.domain.entity.PebTransaction;
import org.nexus.peb.domain.enums.AdmissionPath;
import org.nexus.peb.domain.enums.AdmissionResult;
import org.nexus.peb.domain.dto.AdmissionResponse;
import org.nexus.peb.domain.port.ConduitMcpPort;
import org.nexus.peb.domain.port.LosmIrTransitionPort;
import org.nexus.peb.domain.port.ResolutionExecutionClaimPort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
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
 *
 * <p>After a transaction is committed, the engine optionally notifies
 * external systems via the adapter ports:
 * <ul>
 *   <li>{@link ConduitMcpPort} — forwards governance events to conduit-mcp</li>
 *   <li>{@link LosmIrTransitionPort} — notifies LOSM of state transitions</li>
 * </ul>
 */
@Service
public class PebGovernanceEngine {

    private static final Logger log = LoggerFactory.getLogger(PebGovernanceEngine.class);

    private final PebTransactionEngine transactionEngine;
    private final InvariantValidator validator;
    private final PebViolationEngine violationEngine;
    private final ConduitMcpPort conduitAdapter;
    private final LosmIrTransitionPort losmAdapter;
    private final ResolutionExecutionClaimPort resolutionClaimAdapter;

    /**
     * Spring wiring constructor. The resolution adapter is optional for
     * legacy/non-execution transactions, but execution-claim transactions
     * fail closed when it is absent or unavailable.
     */
    @Autowired
    public PebGovernanceEngine(PebTransactionEngine transactionEngine,
                                InvariantValidator validator,
                                PebViolationEngine violationEngine,
                                @Autowired(required = false) ConduitMcpPort conduitAdapter,
                                @Autowired(required = false) LosmIrTransitionPort losmAdapter,
                                @Autowired(required = false) ResolutionExecutionClaimPort resolutionClaimAdapter) {
        this.transactionEngine = transactionEngine;
        this.validator = validator;
        this.violationEngine = violationEngine;
        this.conduitAdapter = conduitAdapter;
        this.losmAdapter = losmAdapter;
        this.resolutionClaimAdapter = resolutionClaimAdapter;
    }

    /**
     * Backwards-compatible constructor for narrow unit tests and callers that
     * do not install external adapters. Claim-bearing requests still fail
     * closed because the resolution adapter is null.
     */
    public PebGovernanceEngine(PebTransactionEngine transactionEngine,
                                InvariantValidator validator,
                                PebViolationEngine violationEngine,
                                ConduitMcpPort conduitAdapter,
                                LosmIrTransitionPort losmAdapter) {
        this(transactionEngine, validator, violationEngine, conduitAdapter,
             losmAdapter, null);
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
     *
     * After the transaction commits, adapters are notified asynchronously:
     * <ul>
     *   <li>ConduitMcpAdapter receives the governance event for pipeline integration</li>
     *   <li>LosmIrTransitionAdapter is notified of state changes for lifecycle management</li>
     * </ul>
     */
    @Transactional
    public AdmissionResponse processForPath(PebTransaction request, AdmissionPath path) {
        boolean bypassValidator = (path == AdmissionPath.REPORT_VIOLATION);
        boolean validatorPassed = bypassValidator || validator.validate(request);
        boolean carriesExecutionClaim = carriesExecutionClaim(request);
        String executionAdmissionReason = null;
        boolean executionAdmissionPassed = true;

        if (validatorPassed && carriesExecutionClaim) {
            // Assign the PEB identity before resolution admission so the
            // resolution-side receipt is correlated to the exact transaction
            // that will be persisted below.
            request.ensureId();
        }

        request.setAdmissionResult(
            (bypassValidator || !validatorPassed) ? AdmissionResult.REJECTED
                                                 : path.defaultAdmissionResult()
        );

        PebTransaction tx = transactionEngine.beginTransaction(request);

        if (validatorPassed && carriesExecutionClaim) {
            if (resolutionClaimAdapter == null) {
                executionAdmissionPassed = false;
                executionAdmissionReason = "RESOLUTION_ADMISSION_UNAVAILABLE";
            } else {
                var assessment = resolutionClaimAdapter.admitVerifiedExecutionClaim(
                    tx.ensureId(), tx.getInput());
                executionAdmissionPassed = assessment.admitted();
                executionAdmissionReason = assessment.reason();
            }

            if (!executionAdmissionPassed) {
                tx.setAdmissionResult(AdmissionResult.REJECTED);
                violationEngine.recordExecutionAdmissionRejection(
                    tx, executionAdmissionReason);
            }
        }

        transactionEngine.commitTransaction(tx);

        // Notify external adapters after transaction commits
        notifyAdapters(tx, path);

        if (bypassValidator) {
            violationEngine.ingest(tx);
            return AdmissionResponse.accepted("Violation recorded as REJECTED");
        }
        if (!validatorPassed) {
            return AdmissionResponse.denied("Admission denied by invariant validator");
        }
        if (!executionAdmissionPassed) {
            return AdmissionResponse.denied(
                "Execution claim admission denied: " + executionAdmissionReason);
        }
        String message = switch (path) {
            case VALIDATE -> "Validation processed";
            case MUTATE   -> "Mutation processed";
            case UNKNOWN  -> "Routed (unknown tool)";
            default       -> "Transaction processed";
        };
        return AdmissionResponse.accepted(message);
    }

    private static boolean carriesExecutionClaim(PebTransaction request) {
        return request != null && request.getInput() != null
            && request.getInput().isObject()
            && request.getInput().has("execution_claim");
    }

    /**
     * Notify external adapters of the committed transaction.
     * Errors are logged but do not propagate — adapters are best-effort.
     */
    private void notifyAdapters(PebTransaction tx, AdmissionPath path) {
        // Notify conduit-mcp of governance events (except UNKNOWN path)
        if (conduitAdapter != null && path != AdmissionPath.UNKNOWN) {
            try {
                var receipt = new com.fasterxml.jackson.databind.node.ObjectNode(
                    com.fasterxml.jackson.databind.node.JsonNodeFactory.instance);
                receipt.put("eventId", tx.getId().toString());
                receipt.put("eventType", "peb.transaction.committed");
                receipt.put("toolName", tx.getToolName());
                receipt.put("admissionResult", tx.getAdmissionResult().name());
                receipt.put("entityId", tx.getEntityId());
                conduitAdapter.issueReceipt(receipt);
            } catch (Exception e) {
                log.warn("Failed to notify conduit-mcp of transaction {}: {}", tx.getId(), e.getMessage());
            }
        }

        // Notify LOSM of state transitions (for MUTATE path)
        if (losmAdapter != null && path == AdmissionPath.MUTATE) {
            try {
                losmAdapter.transition(
                    tx.getId().toString(),
                    "PEB_COMMITTED",
                    "peb-kernel",
                    "Transaction committed: " + tx.getToolName()
                );
            } catch (Exception e) {
                log.warn("Failed to notify LOSM of transaction {}: {}", tx.getId(), e.getMessage());
            }
        }
    }
}
