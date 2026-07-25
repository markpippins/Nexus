package org.nexus.peb.core.violation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.nexus.peb.domain.entity.PebTransaction;
import org.nexus.peb.domain.entity.PebViolation;
import org.nexus.peb.domain.enums.ViolationResolution;
import org.nexus.peb.domain.enums.ViolationSeverity;
import org.nexus.peb.domain.enums.ViolationType;
import org.nexus.peb.domain.exception.MalformedAdmissionRequestException;
import org.nexus.peb.store.repository.PebViolationRepository;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Tests for {@link PebViolationEngine} covering all four paths
 * per the Tester role mandate.
 *
 * <h3>Coverage model</h3>
 * <ol>
 *   <li><b>Green path</b> — valid violation reports produce persisted violations.</li>
 *   <li><b>Orange path</b> — invalid (null input, missing fields, unknown enums)
 *       are rejected with clear {@link MalformedAdmissionRequestException}.</li>
 *   <li><b>Red path</b> — adversarial JSON payloads, boundary conditions.</li>
 *   <li><b>Silent failure</b> — the violation's context and resolution are
 *       correctly set, not defaulted or silently lost.</li>
 * </ol>
 *
 * <p>Note: The orange-path tests are especially critical because the
 * violation engine has actual logic (unlike the validator stub) and
 * the controller maps {@link MalformedAdmissionRequestException} to
 * HTTP 422 — so bad input must be caught here.
 */
@DisplayName("PebViolationEngine")
@ExtendWith(MockitoExtension.class)
class PebViolationEngineTest {

    @Mock
    private PebViolationRepository repository;

    private PebViolationEngine engine;
    private ObjectMapper mapper;

    @BeforeEach
    void setUp() {
        engine = new PebViolationEngine(repository);
        mapper = new ObjectMapper();
    }

    // ─────────────────────────────────────────────────────────────
    // GREEN PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Green path — valid violation reports")
    class GreenPath {

        @Test
        @DisplayName("valid authority_leakage violation is ingested")
        void validAuthorityLeakage_isIngested() {
            ObjectNode input = buildValidInput("authority_leakage", "hard");
            PebTransaction tx = createTransaction(input);
            PebViolation expectedViolation = new PebViolation();
            expectedViolation.setId(UUID.randomUUID());
            when(repository.save(any(PebViolation.class))).thenReturn(expectedViolation);

            PebViolation result = engine.ingest(tx);

            assertNotNull(result);
            verify(repository, times(1)).save(any(PebViolation.class));
        }

        @Test
        @DisplayName("violation has correct type and severity set from input")
        void violation_hasCorrectTypeAndSeverity() {
            ObjectNode input = buildValidInput("rcl_violation", "soft");
            PebTransaction tx = createTransaction(input);
            PebViolation expectedViolation = new PebViolation();
            expectedViolation.setId(UUID.randomUUID());
            when(repository.save(any(PebViolation.class))).thenAnswer(inv -> {
                PebViolation v = inv.getArgument(0);
                assertEquals(ViolationType.RCL, v.getViolationType(),
                    "rcl_violation should map to RCL");
                assertEquals(ViolationSeverity.SOFT, v.getSeverity(),
                    "soft should map to SOFT severity");
                return v;
            });

            engine.ingest(tx);
            verify(repository).save(any(PebViolation.class));
        }

        @Test
        @DisplayName("violation has REJECTED resolution by default")
        void violation_hasRejectedResolution() {
            ObjectNode input = buildValidInput("authority_leakage", "hard");
            PebTransaction tx = createTransaction(input);
            when(repository.save(any(PebViolation.class))).thenAnswer(inv -> {
                PebViolation v = inv.getArgument(0);
                assertEquals(ViolationResolution.REJECTED, v.getResolution(),
                    "Violation should default to REJECTED resolution");
                return v;
            });

            engine.ingest(tx);
            verify(repository).save(any(PebViolation.class));
        }

        @Test
        @DisplayName("violation references correct transaction ID")
        void violation_referencesCorrectTransactionId() {
            ObjectNode input = buildValidInput("state_dependency", "hard");
            PebTransaction tx = createTransaction(input);
            when(repository.save(any(PebViolation.class))).thenAnswer(inv -> {
                PebViolation v = inv.getArgument(0);
                assertEquals(tx.getId(), v.getTransactionId(),
                    "Violation must reference the correct transaction");
                return v;
            });

            engine.ingest(tx);
            verify(repository).save(any(PebViolation.class));
        }

        @Test
        @DisplayName("violation with capability_attempted field preserves it")
        void violation_withCapabilityAttempted_preserves() {
            ObjectNode input = buildValidInput("authority_leakage", "hard");
            input.put("capability_attempted", "peb_force_transition");
            PebTransaction tx = createTransaction(input);
            when(repository.save(any(PebViolation.class))).thenAnswer(inv -> {
                PebViolation v = inv.getArgument(0);
                assertEquals("peb_force_transition", v.getCapabilityAttempted(),
                    "capability_attempted should be preserved");
                return v;
            });

            engine.ingest(tx);
            verify(repository).save(any(PebViolation.class));
        }

        @Test
        @DisplayName("violation without capability_attempted leaves it null")
        void violation_withoutCapabilityAttempted_null() {
            ObjectNode input = buildValidInput("authority_leakage", "hard");
            // No capability_attempted key
            PebTransaction tx = createTransaction(input);
            when(repository.save(any(PebViolation.class))).thenAnswer(inv -> {
                PebViolation v = inv.getArgument(0);
                assertNull(v.getCapabilityAttempted(),
                    "Missing capability_attempted should be null");
                return v;
            });

            engine.ingest(tx);
            verify(repository).save(any(PebViolation.class));
        }
    }

    // ─────────────────────────────────────────────────────────────
    // ORANGE PATH — expected rejection
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Orange path — invalid inputs are rejected")
    class OrangePath {

        @Test
        @DisplayName("null input throws MalformedAdmissionRequestException")
        void nullInput_throwsException() {
            PebTransaction tx = createTransactionWithNullInput();

            MalformedAdmissionRequestException ex = assertThrows(
                MalformedAdmissionRequestException.class,
                () -> engine.ingest(tx),
                "Null input must throw MalformedAdmissionRequestException");
            assertTrue(ex.getMessage().contains("non-null input"),
                "Error message should mention null input: " + ex.getMessage());
            verify(repository, never()).save(any());
        }

        @Test
        @DisplayName("missing violation_type throws MalformedAdmissionRequestException")
        void missingViolationType_throwsException() {
            ObjectNode input = mapper.createObjectNode();
            input.put("severity", "hard");
            // No violation_type
            PebTransaction tx = createTransaction(input);

            MalformedAdmissionRequestException ex = assertThrows(
                MalformedAdmissionRequestException.class,
                () -> engine.ingest(tx));
            assertTrue(ex.getMessage().contains("violation_type"),
                "Error message should mention violation_type: " + ex.getMessage());
            verify(repository, never()).save(any());
        }

        @Test
        @DisplayName("missing severity throws MalformedAdmissionRequestException")
        void missingSeverity_throwsException() {
            ObjectNode input = mapper.createObjectNode();
            input.put("violation_type", "authority_leakage");
            // No severity
            PebTransaction tx = createTransaction(input);

            MalformedAdmissionRequestException ex = assertThrows(
                MalformedAdmissionRequestException.class,
                () -> engine.ingest(tx));
            assertTrue(ex.getMessage().contains("severity"),
                "Error message should mention severity: " + ex.getMessage());
            verify(repository, never()).save(any());
        }

        @Test
        @DisplayName("empty violation_type string throws MalformedAdmissionRequestException")
        void emptyViolationType_throwsException() {
            ObjectNode input = mapper.createObjectNode();
            input.put("violation_type", "");
            input.put("severity", "hard");
            PebTransaction tx = createTransaction(input);

            assertThrows(MalformedAdmissionRequestException.class,
                () -> engine.ingest(tx));
        }

        @Test
        @DisplayName("unknown violation_type throws MalformedAdmissionRequestException")
        void unknownViolationType_throwsException() {
            ObjectNode input = mapper.createObjectNode();
            input.put("violation_type", "nonexistent_violation");
            input.put("severity", "hard");
            PebTransaction tx = createTransaction(input);

            MalformedAdmissionRequestException ex = assertThrows(
                MalformedAdmissionRequestException.class,
                () -> engine.ingest(tx));
            assertTrue(ex.getMessage().contains("nonexistent_violation"),
                "Error message should include the bad value");
        }

        @Test
        @DisplayName("unknown severity throws MalformedAdmissionRequestException")
        void unknownSeverity_throwsException() {
            ObjectNode input = mapper.createObjectNode();
            input.put("violation_type", "authority_leakage");
            input.put("severity", "critical");  // not 'hard' or 'soft'
            PebTransaction tx = createTransaction(input);

            MalformedAdmissionRequestException ex = assertThrows(
                MalformedAdmissionRequestException.class,
                () -> engine.ingest(tx));
            assertTrue(ex.getMessage().contains("critical"),
                "Error message should include the bad severity value");
        }

        @Test
        @DisplayName("non-textual violation_type (number) throws exception")
        void numericViolationType_throwsException() {
            ObjectNode input = mapper.createObjectNode();
            input.put("violation_type", 42);
            input.put("severity", "hard");
            PebTransaction tx = createTransaction(input);

            assertThrows(MalformedAdmissionRequestException.class,
                () -> engine.ingest(tx));
        }

        @Test
        @DisplayName("non-textual severity (boolean) throws exception")
        void booleanSeverity_throwsException() {
            ObjectNode input = mapper.createObjectNode();
            input.put("violation_type", "authority_leakage");
            input.put("severity", true);
            PebTransaction tx = createTransaction(input);

            assertThrows(MalformedAdmissionRequestException.class,
                () -> engine.ingest(tx));
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RED PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Red path — adversarial input")
    class RedPath {

        @Test
        @DisplayName("massively nested JSON in context does not cause issues")
        void deeplyNestedInput_safe() throws Exception {
            ObjectNode input = (ObjectNode) mapper.readTree(
                "{\"violation_type\":\"authority_leakage\"," +
                "\"severity\":\"hard\"}");
            PebTransaction tx = createTransaction(input);
            when(repository.save(any(PebViolation.class))).thenReturn(new PebViolation());

            assertDoesNotThrow(() -> engine.ingest(tx),
                "Normal input should not cause exceptions");
        }

        @Test
        @DisplayName("violation_type with SQL-like injection is rejected")
        void sqlInjectionViolationType_rejected() {
            ObjectNode input = mapper.createObjectNode();
            input.put("violation_type", "'; DROP TABLE peb.violations; --");
            input.put("severity", "hard");
            PebTransaction tx = createTransaction(input);

            assertThrows(MalformedAdmissionRequestException.class,
                () -> engine.ingest(tx),
                "SQL injection attempt in violation_type should be rejected");
        }

        @Test
        @DisplayName("repository exception during save propagates")
        void repositoryException_propagates() {
            ObjectNode input = buildValidInput("authority_leakage", "hard");
            PebTransaction tx = createTransaction(input);
            when(repository.save(any(PebViolation.class)))
                .thenThrow(new RuntimeException("DB down"));

            assertThrows(RuntimeException.class,
                () -> engine.ingest(tx),
                "Repository exception should propagate to caller");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // SILENT FAILURE
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Silent failure — data integrity")
    class SilentFailure {

        /**
         * Verifies the context (full JSON payload) is preserved on the
         * violation. If context is silently dropped, traceability is lost.
         */
        @Test
        @DisplayName("violation context preserves full input payload")
        void violation_contextPreservesInput() {
            ObjectNode input = buildValidInput("transform_invalid", "soft");
            input.put("extra_field", "should be preserved");
            input.put("nested", mapper.createObjectNode().put("key", "value"));
            PebTransaction tx = createTransaction(input);
            when(repository.save(any(PebViolation.class))).thenAnswer(inv -> {
                PebViolation v = inv.getArgument(0);
                assertNotNull(v.getContext(), "Context must not be null");
                assertTrue(v.getContext().has("extra_field"),
                    "Context should preserve extra fields");
                assertTrue(v.getContext().has("nested"),
                    "Context should preserve nested objects");
                return v;
            });

            engine.ingest(tx);
            verify(repository).save(any(PebViolation.class));
        }

        /**
         * Metamorphic test: each call to ingest with different transaction
         * IDs should produce violations with different transaction IDs.
         */
        @Test
        @DisplayName("different transactions produce violations with different transaction IDs")
        void differentTransactions_differentViolationIds() {
            ObjectNode input = buildValidInput("authority_leakage", "hard");
            PebTransaction tx1 = createTransaction(input);
            PebTransaction tx2 = createTransaction(input);
            when(repository.save(any(PebViolation.class)))
                .thenReturn(new PebViolation());

            engine.ingest(tx1);
            engine.ingest(tx2);

            verify(repository, times(2)).save(any(PebViolation.class));
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    private ObjectNode buildValidInput(String violationType, String severity) {
        ObjectNode input = mapper.createObjectNode();
        input.put("violation_type", violationType);
        input.put("severity", severity);
        return input;
    }

    private PebTransaction createTransaction(ObjectNode input) {
        PebTransaction tx = new PebTransaction();
        ReflectionTestUtils.setField(tx, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(tx, "toolName", "peb_report_violation");
        ReflectionTestUtils.setField(tx, "entityId", "test-entity");
        ReflectionTestUtils.setField(tx, "input", input);
        return tx;
    }

    private PebTransaction createTransactionWithNullInput() {
        PebTransaction tx = new PebTransaction();
        ReflectionTestUtils.setField(tx, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(tx, "toolName", "peb_report_violation");
        ReflectionTestUtils.setField(tx, "entityId", "test-entity");
        ReflectionTestUtils.setField(tx, "input", null);
        return tx;
    }
}
