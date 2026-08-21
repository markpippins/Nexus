package org.nexus.peb.domain.dto;

import java.util.UUID;

/**
 * Result of asking resolution whether a verified execution claim/evidence
 * pair is eligible for PEB admission.
 *
 * <p>This is an eligibility assessment, not a PEB settlement. PEB still owns
 * the transaction admission result and its durable governance record.
 */
public record ExecutionClaimAdmission(
    boolean admitted,
    String reason,
    UUID resolutionReceiptId
) {
    public static ExecutionClaimAdmission admitted(String reason, UUID receiptId) {
        return new ExecutionClaimAdmission(true, reason, receiptId);
    }

    public static ExecutionClaimAdmission rejected(String reason) {
        return new ExecutionClaimAdmission(false, reason, null);
    }
}
