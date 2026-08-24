package org.nexus.peb.adapters.resolution;

import com.fasterxml.jackson.databind.JsonNode;
import org.nexus.peb.domain.dto.ExecutionClaimAdmission;
import org.nexus.peb.domain.port.ResolutionExecutionClaimPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Same-database adapter for the resolution execution-admission function.
 *
 * <p>The adapter is deliberately narrow: the current execution slice accepts
 * only the Git verifier contract. Resolution owns the evidence/link checks;
 * this class only extracts the correlation envelope and maps the SQL result.
 * Any malformed request or unavailable resolution function fails closed.
 */
@Component
public class ResolutionExecutionClaimAdapter implements ResolutionExecutionClaimPort {

    private static final String EXPECTED_SOURCE_SYSTEM = "git-verifier";
    private static final String EXPECTED_EVIDENCE_KIND = "git_ref_commit";

    private final JdbcTemplate jdbc;

    public ResolutionExecutionClaimAdapter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public ExecutionClaimAdmission admitVerifiedExecutionClaim(UUID pebTransactionId, JsonNode input) {
        if (pebTransactionId == null || input == null
                || !input.isObject()
                || !input.path("execution_claim").isObject()
                || !input.path("execution_evidence").isObject()) {
            return ExecutionClaimAdmission.rejected("MISSING_EXECUTION_CLAIM_EVIDENCE_ENVELOPE");
        }

        JsonNode claim = input.path("execution_claim");
        JsonNode evidence = input.path("execution_evidence");
        JsonNode context = input.path("execution_context");

        UUID claimId = uuid(firstText(claim, "resolution_claim_id", "id"));
        UUID evidenceId = uuid(firstText(evidence, "resolution_evidence_id", "id"));
        String policyHash = firstText(context, "policy_version_hash");
        if (policyHash == null) {
            policyHash = firstText(evidence, "policy_version_hash");
        }
        String leaseId = firstText(context, "lease_id");
        if (leaseId == null) {
            leaseId = firstText(evidence, "lease_id");
        }
        String grantId = firstText(context, "grant_id");
        if (grantId == null) {
            grantId = firstText(evidence, "grant_id");
        }
        String attemptId = firstText(context, "attempt_id");
        if (attemptId == null) {
            attemptId = firstText(evidence, "attempt_id");
        }

        if (claimId == null || evidenceId == null || policyHash == null
                || leaseId == null || grantId == null || attemptId == null) {
            return ExecutionClaimAdmission.rejected("INVALID_EXECUTION_CLAIM_EVIDENCE_CONTEXT");
        }

        try {
            List<ExecutionClaimAdmission> results = jdbc.query(
                "SELECT admitted, reason, receipt_id "
                    + "FROM resolution.admit_verified_execution_claim(?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (rs, rowNum) -> new ExecutionClaimAdmission(
                    rs.getBoolean("admitted"),
                    rs.getString("reason"),
                    (UUID) rs.getObject("receipt_id")
                ),
                pebTransactionId,
                claimId,
                evidenceId,
                policyHash,
                leaseId,
                grantId,
                attemptId,
                EXPECTED_SOURCE_SYSTEM,
                EXPECTED_EVIDENCE_KIND
            );
            if (results.isEmpty()) {
                return ExecutionClaimAdmission.rejected("RESOLUTION_ADMISSION_NO_RESULT");
            }
            return results.get(0);
        } catch (org.springframework.dao.DataAccessException ex) {
            // The resolution migration may not yet be applied, or the
            // resolution database may be unavailable. Neither condition may
            // turn an unverified claim into admitted authority.
            return ExecutionClaimAdmission.rejected("RESOLUTION_ADMISSION_UNAVAILABLE");
        }
    }

    private static String firstText(JsonNode node, String... names) {
        if (node == null || !node.isObject()) {
            return null;
        }
        for (String name : names) {
            JsonNode value = node.get(name);
            if (value != null && value.isTextual() && !value.asText().isBlank()) {
                return value.asText();
            }
        }
        return null;
    }

    private static UUID uuid(String value) {
        if (value == null) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
