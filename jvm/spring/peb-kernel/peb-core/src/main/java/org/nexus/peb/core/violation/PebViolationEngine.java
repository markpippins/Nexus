package org.nexus.peb.core.violation;

import com.fasterxml.jackson.databind.JsonNode;
import org.nexus.peb.domain.entity.PebTransaction;
import org.nexus.peb.domain.entity.PebViolation;
import org.nexus.peb.domain.enums.ViolationResolution;
import org.nexus.peb.domain.enums.ViolationSeverity;
import org.nexus.peb.domain.enums.ViolationType;
import org.nexus.peb.domain.exception.MalformedAdmissionRequestException;
import org.nexus.peb.store.repository.PebViolationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Persists {@link PebViolation} rows that mirror the {@code peb_report_violation}
 * MCP tool — i.e. whenever {@link org.nexus.peb.core.engine.PebGovernanceEngine}
 * detects {@link org.nexus.peb.domain.enums.AdmissionPath#REPORT_VIOLATION}, it
 * calls {@link #ingest(PebTransaction)} after the audit-row commit to write a
 * structured violation alongside the JsonNode snapshot already on
 * {@code peb.transactions}.
 *
 * Lives in pebble-core alongside {@code PebTransactionEngine} because both own
 * a single {@code JPA}-backed write; splitting them keeps the violation's
 * transactional boundary isolated so a violation insertion can roll back
 * independently of the audit row.
 */
@Service
public class PebViolationEngine {

    private final PebViolationRepository repository;

    public PebViolationEngine(PebViolationRepository repository) {
        this.repository = repository;
    }

    /**
     * Build and persist a {@link PebViolation} from a fully-formed
     * {@code peb_report_violation} transaction.
     *
     * <p>Required fields in {@link PebTransaction#getInput()}:
     * {@code violation_type} (must be a valid {@link ViolationType}) and
     * {@code severity} (must be a valid {@link ViolationSeverity}). Optional
     * fields: {@code capability_attempted}. The full input payload is mirrored
     * onto {@link PebViolation#getContext()} for traceability.
     *
     * @throws MalformedAdmissionRequestException if a required field is missing
     *                                           or carries an unknown enum
     *                                           value. The controller's typed
     *                                           {@code @ExceptionHandler}
     *                                           maps this to HTTP 422. Note
     *                                           that the audit row in
     *                                           {@code peb.transactions} has
     *                                           already been written by the
     *                                           time this throws, but the
     *                                           outer {@code @Transactional}
     *                                           on
     *                                           {@link org.nexus.peb.core.engine.PebGovernanceEngine#processForPath}
     *                                           rolls back BOTH writes, so no
     *                                           partial-state row is left in
     *                                           the audit log.
     */
    /**
     * Record a rejected execution-claim admission as a first-class authority
     * violation. This path is intentionally separate from
     * {@code peb_report_violation}: the worker does not get to choose whether
     * its own claim is a violation, and the kernel preserves the rejection
     * reason in the violation context.
     */
    @Transactional
    public PebViolation recordExecutionAdmissionRejection(
            PebTransaction transaction, String reason) {
        PebViolation violation = new PebViolation();
        violation.setId(UUID.randomUUID());
        violation.setTransactionId(transaction.getId());
        violation.setViolationType(ViolationType.AUTHORITY_LEAKAGE);
        violation.setSeverity(ViolationSeverity.HARD);
        violation.setEntityId(transaction.getEntityId());
        violation.setCapabilityAttempted("execution_claim_admission");
        violation.setContext(
            com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode()
        );
        ((com.fasterxml.jackson.databind.node.ObjectNode) violation.getContext())
            .put("reason", reason == null ? "UNKNOWN" : reason)
            .set("input", transaction.getInput());
        violation.setResolution(ViolationResolution.REJECTED);
        return repository.save(violation);
    }

    @Transactional
    public PebViolation ingest(PebTransaction transaction) {
        JsonNode input = transaction.getInput();
        if (input == null) {
            throw new MalformedAdmissionRequestException(
                "peb_report_violation requires a non-null input payload");
        }

        JsonNode vTypeNode = input.get("violation_type");
        JsonNode vSevNode  = input.get("severity");
        JsonNode vCapNode  = input.get("capability_attempted");

        if (vTypeNode == null || !vTypeNode.isTextual()) {
            throw new MalformedAdmissionRequestException(
                "peb_report_violation requires a textual 'violation_type' field");
        }
        if (vSevNode == null || !vSevNode.isTextual()) {
            throw new MalformedAdmissionRequestException(
                "peb_report_violation requires a textual 'severity' field");
        }

        // Bridge the MCP facade -> kernel enum naming convention. The MCP
        // facade schemas declare violation_type in *lowercase snake_case*
        // (`authority_leakage`, `rcl_violation`, ...) and severity in
        // *lowercase* (`hard`, `soft`); the kernel's Java enums expect their
        // uppercase variants (with the additional quirk that `rcl_violation`
        // shortens to `RCL`). The normalization/parsing logic now lives on
        // the enums themselves — see {@link ViolationType#fromMcpValue} and
        // {@link ViolationSeverity#fromMcpValue} — so it can be unit-tested
        // independently and the engine doesn't carry the bridge shape.
        ViolationType violationType = ViolationType.fromMcpValue(vTypeNode.asText());
        ViolationSeverity severity = ViolationSeverity.fromMcpValue(vSevNode.asText());

        PebViolation v = new PebViolation();
        v.setId(UUID.randomUUID());
        v.setTransactionId(transaction.getId());
        v.setViolationType(violationType);
        v.setSeverity(severity);
        v.setEntityId(transaction.getEntityId());
        v.setCapabilityAttempted(vCapNode != null && vCapNode.isTextual()
                                  ? vCapNode.asText() : null);
        v.setContext(input);
        v.setResolution(ViolationResolution.REJECTED);

        // createdAt is filled by @PrePersist onCreate() on PebViolation if null.
        return repository.save(v);
    }
}
