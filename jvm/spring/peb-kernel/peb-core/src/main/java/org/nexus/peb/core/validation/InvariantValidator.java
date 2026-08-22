package org.nexus.peb.core.validation;

import org.nexus.peb.domain.entity.PebTransaction;
import org.nexus.peb.domain.enums.AdmissionPath;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Validates inbound {@link PebTransaction} requests for structural integrity
 * before they enter the governance engine's audit pipeline.
 *
 * <p>This is a <b>structural</b> validator, not a semantic policy engine.
 * It checks that the transaction is well-formed enough to be routed and
 * recorded. Policy-level authorization (who may transition what) is the
 * PostgreSQL Semantic Kernel's domain, via the {@code policy_rule} table.
 *
 * <p>Checks performed:
 * <ol>
 *   <li>Transaction must not be null.</li>
 *   <li>{@code toolName} must be present and map to a known
 *       {@link AdmissionPath} (i.e., not {@link AdmissionPath#UNKNOWN}).</li>
 *   <li>{@code entityId} must be non-null and non-blank.</li>
 *   <li>{@code input} payload must be non-null.</li>
 * </ol>
 *
 * <p>Rejected transactions are logged at {@code WARN} level for auditability.
 * The governance engine maps a {@code false} return to
 * {@link org.nexus.peb.domain.enums.AdmissionResult#REJECTED} and returns
 * HTTP 422 to the caller.
 */
@Component
public class InvariantValidator {

    private static final Logger log = LoggerFactory.getLogger(InvariantValidator.class);

    /**
     * Validate structural invariants of the transaction.
     *
     * @param transaction the transaction to validate (may be null)
     * @return {@code true} if the transaction passes all structural checks;
     *         {@code false} if it is null or fails any check
     */
    public boolean validate(PebTransaction transaction) {
        if (transaction == null) {
            log.warn("InvariantValidator: rejecting null transaction");
            return false;
        }

        // ── toolName must be present and known ──
        String toolName = transaction.getToolName();
        if (toolName == null || toolName.isBlank()) {
            log.warn("InvariantValidator: rejecting transaction {} — "
                     + "toolName is null or blank", transaction.getId());
            return false;
        }
        AdmissionPath path = AdmissionPath.fromToolName(toolName);
        if (path == AdmissionPath.UNKNOWN) {
            log.warn("InvariantValidator: rejecting transaction {} — "
                     + "unknown toolName '{}'", transaction.getId(), toolName);
            return false;
        }

        // ── entityId must be present ──
        String entityId = transaction.getEntityId();
        if (entityId == null || entityId.isBlank()) {
            log.warn("InvariantValidator: rejecting transaction {} — "
                     + "entityId is null or blank", transaction.getId());
            return false;
        }

        // ── input payload must be present ──
        if (transaction.getInput() == null || transaction.getInput().isNull()) {
            log.warn("InvariantValidator: rejecting transaction {} — "
                     + "input payload is null", transaction.getId());
            return false;
        }

        return true;
    }
}
