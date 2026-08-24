package org.nexus.peb.domain.port;

import com.fasterxml.jackson.databind.JsonNode;
import org.nexus.peb.domain.dto.ExecutionClaimAdmission;

import java.util.UUID;

/**
 * Port used by PEB before admitting an execution transaction that carries an
 * execution claim.
 *
 * <p>The implementation asks the resolution schema to validate the immutable
 * evidence linkage and execution context. The worker/model never implements
 * this port and cannot self-authorize or self-verify a claim.
 */
public interface ResolutionExecutionClaimPort {

    /**
     * Assess the claim/evidence envelope embedded in a PEB transaction.
     *
     * @param pebTransactionId the PEB transaction correlation identity
     * @param input transaction input containing execution_claim and
     *              execution_evidence identifiers/context
     * @return admitted only when resolution confirms independently verified
     *         evidence with matching context
     */
    ExecutionClaimAdmission admitVerifiedExecutionClaim(UUID pebTransactionId, JsonNode input);
}
