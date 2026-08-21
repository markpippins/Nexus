package org.nexus.peb.core.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.nexus.peb.core.transaction.PebTransactionEngine;
import org.nexus.peb.core.validation.InvariantValidator;
import org.nexus.peb.core.violation.PebViolationEngine;
import org.nexus.peb.domain.dto.ExecutionClaimAdmission;
import org.nexus.peb.domain.entity.PebTransaction;
import org.nexus.peb.domain.enums.AdmissionPath;
import org.nexus.peb.domain.enums.AdmissionResult;
import org.nexus.peb.domain.port.ResolutionExecutionClaimPort;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("PEB execution-claim admission gate")
class ExecutionClaimAdmissionGateTest {

    @Test
    @DisplayName("resolution-approved verified Git evidence allows the transaction")
    void approvedEvidence_allowsTransaction() {
        FakeResolutionPort resolution = new FakeResolutionPort(
            ExecutionClaimAdmission.admitted("verified Git evidence is eligible for PEB admission", UUID.randomUUID())
        );
        PebTransaction transaction = executionTransaction();
        PebGovernanceEngine engine = engine(resolution, new RecordingViolationEngine());

        var response = engine.processForPath(transaction, AdmissionPath.MUTATE);

        assertTrue(response.admitted());
        assertEquals(AdmissionResult.ALLOWED, transaction.getAdmissionResult());
        assertEquals(transaction.getId(), resolution.transactionId);
    }

    @Test
    @DisplayName("resolution rejection records REJECTED and a hard authority violation")
    void rejectedEvidence_rejectsAndRecordsViolation() {
        FakeResolutionPort resolution = new FakeResolutionPort(
            ExecutionClaimAdmission.rejected("EVIDENCE_NOT_INDEPENDENTLY_VERIFIED")
        );
        RecordingViolationEngine violations = new RecordingViolationEngine();
        PebTransaction transaction = executionTransaction();
        PebGovernanceEngine engine = engine(resolution, violations);

        var response = engine.processForPath(transaction, AdmissionPath.MUTATE);

        assertFalse(response.admitted());
        assertTrue(response.message().contains("EVIDENCE_NOT_INDEPENDENTLY_VERIFIED"));
        assertEquals(AdmissionResult.REJECTED, transaction.getAdmissionResult());
        assertEquals("EVIDENCE_NOT_INDEPENDENTLY_VERIFIED", violations.reason);
    }

    @Test
    @DisplayName("missing resolution adapter rejects claim-bearing transactions")
    void missingResolutionAdapter_failsClosed() {
        RecordingViolationEngine violations = new RecordingViolationEngine();
        PebTransaction transaction = executionTransaction();
        PebGovernanceEngine engine = engine(null, violations);

        var response = engine.processForPath(transaction, AdmissionPath.MUTATE);

        assertFalse(response.admitted());
        assertEquals(AdmissionResult.REJECTED, transaction.getAdmissionResult());
        assertEquals("RESOLUTION_ADMISSION_UNAVAILABLE", violations.reason);
    }

    private static PebGovernanceEngine engine(
            ResolutionExecutionClaimPort resolution,
            RecordingViolationEngine violations) {
        return new PebGovernanceEngine(
            new InMemoryTransactionEngine(),
            new InvariantValidator(),
            violations,
            null,
            null,
            resolution
        );
    }

    private static PebTransaction executionTransaction() {
        ObjectMapper mapper = new ObjectMapper();
        ObjectNode input = mapper.createObjectNode();
        input.putObject("execution_claim").put("resolution_claim_id", UUID.randomUUID().toString());
        input.putObject("execution_evidence").put("resolution_evidence_id", UUID.randomUUID().toString());
        PebTransaction transaction = new PebTransaction();
        transaction.ensureId();
        org.springframework.test.util.ReflectionTestUtils.setField(
            transaction, "idempotencyKey", UUID.randomUUID().toString());
        org.springframework.test.util.ReflectionTestUtils.setField(
            transaction, "entityId", "execution-claim-test");
        org.springframework.test.util.ReflectionTestUtils.setField(
            transaction, "toolName", "peb_record_decision");
        org.springframework.test.util.ReflectionTestUtils.setField(transaction, "input", input);
        transaction.setCreatedAt(Instant.now());
        return transaction;
    }

    private static final class FakeResolutionPort implements ResolutionExecutionClaimPort {
        private final ExecutionClaimAdmission result;
        private UUID transactionId;

        private FakeResolutionPort(ExecutionClaimAdmission result) {
            this.result = result;
        }

        @Override
        public ExecutionClaimAdmission admitVerifiedExecutionClaim(UUID pebTransactionId,
                                                                     com.fasterxml.jackson.databind.JsonNode input) {
            this.transactionId = pebTransactionId;
            return result;
        }
    }

    private static final class InMemoryTransactionEngine extends PebTransactionEngine {
        private InMemoryTransactionEngine() {
            super(null, null);
        }

        @Override
        public PebTransaction beginTransaction(PebTransaction transaction) {
            transaction.ensureId();
            return transaction;
        }

        @Override
        public PebTransaction commitTransaction(PebTransaction transaction) {
            transaction.setCommittedAt(Instant.now());
            return transaction;
        }
    }

    private static final class RecordingViolationEngine extends PebViolationEngine {
        private String reason;

        private RecordingViolationEngine() {
            super(null);
        }

        @Override
        public org.nexus.peb.domain.entity.PebViolation recordExecutionAdmissionRejection(
                PebTransaction transaction, String reason) {
            this.reason = reason;
            return null;
        }
    }
}
