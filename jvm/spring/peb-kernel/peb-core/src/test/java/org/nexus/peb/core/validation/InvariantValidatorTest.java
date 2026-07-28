package org.nexus.peb.core.validation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.nexus.peb.domain.entity.PebTransaction;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for {@link InvariantValidator} covering all four paths per the
 * Tester role mandate.
 *
 * <h3>Coverage model</h3>
 * <ol>
 *   <li><b>Green path</b> — well-formed transactions pass validation.</li>
 *   <li><b>Orange path</b> — transactions with missing or invalid fields
 *       are rejected.</li>
 *   <li><b>Red path</b> — adversarial/concurrent inputs, null safety.</li>
 *   <li><b>Silent failure</b> — metamorphic tests verify the validator
 *       actually inspects its inputs and produces different results for
 *       different inputs (previously the stub accepted everything).</li>
 * </ol>
 */
@DisplayName("InvariantValidator")
class InvariantValidatorTest {

    private InvariantValidator validator;
    private ObjectMapper mapper;

    @BeforeEach
    void setUp() {
        validator = new InvariantValidator();
        mapper = new ObjectMapper();
    }

    // ─────────────────────────────────────────────────────────────
    // GREEN PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Green path — well-formed transactions pass")
    class GreenPath {

        @Test
        @DisplayName("basic transaction with valid input is accepted")
        void wellFormedTransaction_passes() {
            PebTransaction tx = buildTransaction("peb_validate_transition",
                mapper.createObjectNode());
            assertTrue(validator.validate(tx),
                "Well-formed transaction should pass validation");
        }

        @Test
        @DisplayName("MUTATE path transaction with entityId is accepted")
        void mutateTransaction_passes() {
            PebTransaction tx = buildTransaction("peb_record_decision",
                mapper.createObjectNode());
            assertTrue(validator.validate(tx),
                "MUTATE transaction should pass validation");
        }

        @Test
        @DisplayName("transaction with complex nested JSON input is accepted")
        void complexInputTransaction_passes() throws Exception {
            ObjectNode input = (ObjectNode) mapper.readTree(
                "{\"state\":{\"before\":\"active\",\"after\":\"validated\"}," +
                "\"metadata\":{\"source\":\"peb-mcp\",\"version\":1}}");
            PebTransaction tx = buildTransaction("peb_validate_transform", input);
            assertTrue(validator.validate(tx),
                "Transaction with complex nested input should pass validation");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // ORANGE PATH — expected rejection
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Orange path — transactions that SHOULD be rejected")
    class OrangePath {

        @Test
        @DisplayName("null toolName is rejected")
        void nullToolName_rejected() {
            PebTransaction tx = buildTransaction(null, mapper.createObjectNode());
            assertFalse(validator.validate(tx),
                "Null toolName should be rejected");
        }

        @Test
        @DisplayName("null entityId is rejected")
        void nullEntityId_rejected() {
            PebTransaction tx = buildTransaction("peb_validate_transition",
                null, mapper.createObjectNode());
            assertFalse(validator.validate(tx),
                "Null entityId should be rejected");
        }

        @Test
        @DisplayName("blank toolName is rejected")
        void blankToolName_rejected() {
            PebTransaction tx = buildTransaction("  ", mapper.createObjectNode());
            assertFalse(validator.validate(tx),
                "Blank toolName should be rejected");
        }

        @Test
        @DisplayName("blank entityId is rejected")
        void blankEntityId_rejected() {
            PebTransaction tx = buildTransaction("peb_validate_transition",
                "  ", mapper.createObjectNode());
            assertFalse(validator.validate(tx),
                "Blank entityId should be rejected");
        }

        @Test
        @DisplayName("null input is rejected")
        void nullInput_rejected() {
            PebTransaction tx = buildTransactionWithoutInput("peb_validate_transition");
            assertFalse(validator.validate(tx),
                "Null input should be rejected");
        }

        @Test
        @DisplayName("unknown toolName is rejected")
        void unknownToolName_rejected() {
            PebTransaction tx = buildTransaction("nonexistent_tool",
                mapper.createObjectNode());
            assertFalse(validator.validate(tx),
                "Unknown toolName should be rejected");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RED PATH — adversarial input
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Red path — adversarial/boundary input")
    class RedPath {

        @Test
        @DisplayName("null transaction returns false without throwing")
        void nullTransaction_returnsFalse() {
            assertFalse(validator.validate(null),
                "Validator must return false for null transaction");
            assertDoesNotThrow(() -> validator.validate(null),
                "Validator must not throw on null transaction");
        }

        @Test
        @DisplayName("extremely large JSON input does not cause OOM or hang")
        void largeInput_handlesGracefully() {
            ObjectNode input = mapper.createObjectNode();
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 10_000; i++) {
                sb.append("payload-").append(i);
            }
            input.put("large_field", sb.toString());

            PebTransaction tx = buildTransaction("peb_validate_transition", input);
            assertDoesNotThrow(() -> validator.validate(tx),
                "Validator should handle large inputs without OOM");
            assertTrue(validator.validate(tx),
                "Valid transaction with large input should pass");
        }

        @Test
        @DisplayName("deeply nested JSON does not cause stack overflow")
        void deeplyNestedInput_handlesGracefully() throws Exception {
            StringBuilder json = new StringBuilder("{\"key\":");
            for (int i = 0; i < 100; i++) {
                json.append("{\"inner\":");
            }
            json.append("\"value\"");
            for (int i = 0; i < 100; i++) {
                json.append("}");
            }
            json.append("}");

            ObjectNode input = (ObjectNode) mapper.readTree(json.toString());
            PebTransaction tx = buildTransaction("peb_validate_transition", input);
            assertDoesNotThrow(() -> validator.validate(tx),
                "Validator should handle deeply nested JSON without stack overflow");
            assertTrue(validator.validate(tx),
                "Valid transaction with deeply nested input should pass");
        }

        @Test
        @DisplayName("SQL-injection-like toolName is rejected (maps to UNKNOWN)")
        void sqlInjectionToolName_rejected() {
            PebTransaction tx = buildTransaction(
                "peb_val'; DROP TABLE peb.transactions; --",
                mapper.createObjectNode());
            assertFalse(validator.validate(tx),
                "SQL-injection-like toolName maps to UNKNOWN and should be rejected");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // SILENT FAILURE — the most critical category
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Silent failure — the validator actually validates now")
    class SilentFailure {

        /**
         * Regression test: The validator was previously a stub that always
         * returned true. This test locks in that the validator now rejects
         * clearly invalid transactions. If this test ever breaks, the
         * validator has regressed back to stub behavior.
         */
        @Test
        @DisplayName("REGRESSION LOCK: invalid transactions are actually rejected")
        void regressionLock_invalidTransactionsAreRejected() {
            // Case 1: null toolName → rejected
            assertFalse(validator.validate(
                buildTransaction(null, mapper.createObjectNode())),
                "Null toolName must be rejected");

            // Case 2: unknown toolName → rejected
            assertFalse(validator.validate(
                buildTransaction("completely_invalid_tool_name_12345",
                    mapper.createObjectNode())),
                "Unknown toolName must be rejected");

            // Case 3: null entityId → rejected
            assertFalse(validator.validate(
                buildTransaction("peb_validate_transition", null,
                    mapper.createObjectNode())),
                "Null entityId must be rejected");

            // Case 4: null input → rejected
            assertFalse(validator.validate(
                buildTransactionWithoutInput("peb_validate_transition")),
                "Null input must be rejected");
        }

        /**
         * Metamorphic test: All three known admission paths (VALIDATE,
         * MUTATE, REPORT_VIOLATION) with valid entities and inputs should
         * all pass. The validator is structural — it does not differentiate
         * by path. Policy-level differentiation happens in the kernel.
         */
        @Test
        @DisplayName("METAMORPHIC: all known tool paths pass for well-formed transactions")
        void metamorphic_allKnownPaths_pass() {
            PebTransaction validateTx = buildTransaction("peb_validate_transition",
                mapper.createObjectNode());
            PebTransaction mutateTx = buildTransaction("peb_record_decision",
                mapper.createObjectNode());
            PebTransaction violationTx = buildTransaction("peb_report_violation",
                mapper.createObjectNode());

            assertAll(
                () -> assertTrue(validator.validate(validateTx),
                    "peb_validate_transition should pass"),
                () -> assertTrue(validator.validate(mutateTx),
                    "peb_record_decision should pass"),
                () -> assertTrue(validator.validate(violationTx),
                    "peb_report_violation should pass")
            );
        }

        /**
         * Differential test: Two transactions with different but valid
         * entityIds should both pass. The validator does not check
         * authorization — that is the policy engine's responsibility.
         */
        @Test
        @DisplayName("DIFFERENTIAL: different valid entityIds both pass")
        void differential_differentValidEntityIds_bothPass() {
            PebTransaction tx1 = buildTransaction(
                "peb_validate_transition", "entity-alpha",
                mapper.createObjectNode());
            PebTransaction tx2 = buildTransaction(
                "peb_validate_transition", "entity-beta",
                mapper.createObjectNode());

            assertTrue(validator.validate(tx1),
                "Valid entity-alpha should pass");
            assertTrue(validator.validate(tx2),
                "Valid entity-beta should pass");
        }

        /**
         * Metamorphic test: A null entityId should differ from a valid
         * entityId — the validator must actually inspect inputs, not
         * return the same value for all cases.
         */
        @Test
        @DisplayName("METAMORPHIC: null vs valid entityId produces different results")
        void metamorphic_nullVsValidEntityId_differs() {
            PebTransaction nullEntityTx = buildTransaction(
                "peb_validate_transition", null, mapper.createObjectNode());
            PebTransaction validEntityTx = buildTransaction(
                "peb_validate_transition", "valid-entity",
                mapper.createObjectNode());

            boolean nullResult = validator.validate(nullEntityTx);
            boolean validResult = validator.validate(validEntityTx);

            assertNotEquals(nullResult, validResult,
                "Validator must differentiate null vs valid entityId — "
                + "null should be rejected, valid should pass");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    private PebTransaction buildTransaction(String toolName, ObjectNode input) {
        return buildTransaction(toolName, "test-entity", input);
    }

    private PebTransaction buildTransaction(String toolName, String entityId,
                                             ObjectNode input) {
        PebTransaction tx = new PebTransaction();
        ReflectionTestUtils.setField(tx, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(tx, "toolName", toolName);
        ReflectionTestUtils.setField(tx, "entityId", entityId);
        ReflectionTestUtils.setField(tx, "input", input);
        ReflectionTestUtils.setField(tx, "createdAt", Instant.now());
        return tx;
    }

    private PebTransaction buildTransactionWithoutInput(String toolName) {
        PebTransaction tx = new PebTransaction();
        ReflectionTestUtils.setField(tx, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(tx, "toolName", toolName);
        ReflectionTestUtils.setField(tx, "entityId", "test-entity");
        // input left null — used to test null-input rejection
        ReflectionTestUtils.setField(tx, "createdAt", Instant.now());
        return tx;
    }
}
