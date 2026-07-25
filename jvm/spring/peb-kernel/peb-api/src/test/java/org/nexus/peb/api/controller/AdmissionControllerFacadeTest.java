package org.nexus.peb.api.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.nexus.peb.core.engine.PebGovernanceEngine;
import org.nexus.peb.core.violation.PebViolationEngine;
import org.nexus.peb.domain.dto.AdmissionResponse;
import org.nexus.peb.domain.entity.PebTransaction;
import org.nexus.peb.domain.enums.AdmissionPath;
import org.nexus.peb.domain.exception.MalformedAdmissionRequestException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests AdmissionControllerFacade using a hand-written stub for
 * PebGovernanceEngine (Mockito is incompatible with Java 25 on this class).
 */
@DisplayName("AdmissionControllerFacade")
class AdmissionControllerFacadeTest {

    /**
     * Manual stub — overrides processForPath to return controlled responses
     * without needing Mockito bytecode instrumentation.
     */
    private static class StubGovernanceEngine extends PebGovernanceEngine {
        AdmissionResponse nextResponse;
        RuntimeException nextException;

        StubGovernanceEngine() {
            super(null, null, null);
        }

        @Override
        public AdmissionResponse processForPath(PebTransaction request, AdmissionPath path) {
            if (nextException != null) {
                RuntimeException ex = nextException;
                nextException = null;
                throw ex;
            }
            return nextResponse;
        }
    }

    private StubGovernanceEngine governanceEngine;
    private AdmissionControllerFacade controller;

    @BeforeEach
    void setUp() {
        governanceEngine = new StubGovernanceEngine();
        controller = new AdmissionControllerFacade(governanceEngine);
    }

    private PebTransaction makeTransaction(String toolName) {
        PebTransaction tx = new PebTransaction();
        ReflectionTestUtils.setField(tx, "toolName", toolName);
        return tx;
    }

    private void stubAccepted(String message) {
        governanceEngine.nextResponse = AdmissionResponse.accepted(message);
    }

    private void stubDenied(String message) {
        governanceEngine.nextResponse = AdmissionResponse.denied(message);
    }

    private void stubException(RuntimeException ex) {
        governanceEngine.nextException = ex;
    }

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath - admission succeeds (200 OK)")
    class GreenPath {

        @Test
        @DisplayName("VALIDATE tool -> 200 OK")
        void validate_tool_returns200() {
            stubAccepted("Validated");
            ResponseEntity<String> result = controller.submitTransaction(
                    makeTransaction("peb_validate_transition"));

            assertEquals(HttpStatus.OK, result.getStatusCode());
            assertEquals("Validated", result.getBody());
        }

        @Test
        @DisplayName("MUTATE tool -> 200 OK")
        void mutate_tool_returns200() {
            stubAccepted("Mutated");
            ResponseEntity<String> result = controller.submitTransaction(
                    makeTransaction("peb_record_decision"));

            assertEquals(HttpStatus.OK, result.getStatusCode());
            assertEquals("Mutated", result.getBody());
        }

        @Test
        @DisplayName("REPORT_VIOLATION tool -> 200 OK")
        void reportViolation_tool_returns200() {
            stubAccepted("Violation recorded");
            ResponseEntity<String> result = controller.submitTransaction(
                    makeTransaction("peb_report_violation"));

            assertEquals(HttpStatus.OK, result.getStatusCode());
        }

        @Test
        @DisplayName("all VALIDATE tools (3) work")
        void all_validate_tools() {
            String[] tools = {"peb_validate_transition", "peb_check_invariants", "peb_validate_transform"};
            for (String tool : tools) {
                stubAccepted("ok");
                assertEquals(HttpStatus.OK,
                        controller.submitTransaction(makeTransaction(tool)).getStatusCode());
            }
        }

        @Test
        @DisplayName("all MUTATE tools (4) work")
        void all_mutate_tools() {
            String[] tools = {"peb_record_decision", "peb_append_trace_segment",
                    "peb_request_clarification", "peb_extension_proposal"};
            for (String tool : tools) {
                stubAccepted("ok");
                assertEquals(HttpStatus.OK,
                        controller.submitTransaction(makeTransaction(tool)).getStatusCode());
            }
        }
    }

    // ── ORANGE PATH ─────────────────────────────────────────────

    @Nested
    @DisplayName("OrangePath - UNKNOWN toolName (ROUTED, not rejected)")
    class OrangePath {

        @Test
        @DisplayName("unrecognized toolName -> still 200 OK if admitted")
        void unknown_tool_200_if_admitted() {
            stubAccepted("ROUTED: unknown tool");
            ResponseEntity<String> result = controller.submitTransaction(
                    makeTransaction("some_random_tool"));

            assertEquals(HttpStatus.OK, result.getStatusCode());
            assertEquals("ROUTED: unknown tool", result.getBody());
        }

        @Test
        @DisplayName("null toolName -> 200 OK (auditability)")
        void null_toolName_200() {
            stubAccepted("ROUTED: null tool");
            ResponseEntity<String> result = controller.submitTransaction(makeTransaction(null));

            assertEquals(HttpStatus.OK, result.getStatusCode());
        }

        @Test
        @DisplayName("empty toolName -> 200 OK")
        void empty_toolName_200() {
            stubAccepted("ROUTED: empty tool");
            ResponseEntity<String> result = controller.submitTransaction(makeTransaction(""));

            assertEquals(HttpStatus.OK, result.getStatusCode());
        }
    }

    // ── RED PATH ────────────────────────────────────────────────

    @Nested
    @DisplayName("RedPath - engine rejects or throws")
    class RedPath {

        @Test
        @DisplayName("non-admitted -> 422 Unprocessable Entity")
        void engine_rejects_returns422() {
            stubDenied("Invariant violation: hash mismatch");
            ResponseEntity<String> result = controller.submitTransaction(
                    makeTransaction("peb_validate_transition"));

            assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, result.getStatusCode());
            assertEquals("Invariant violation: hash mismatch", result.getBody());
        }

        @Test
        @DisplayName("MalformedAdmissionRequestException propagates (handler tested via @WebMvcTest)")
        void malformedAdmission_propagates() {
            // NOTE: @ExceptionHandler only fires inside Spring MVC DispatcherServlet.
            // Direct POJO call propagates the exception. Spring MVC integration
            // (that it returns 422) is tested via @WebMvcTest (requires Mockito on Java 25).
            stubException(new MalformedAdmissionRequestException("missing violation_type"));

            MalformedAdmissionRequestException ex = assertThrows(
                    MalformedAdmissionRequestException.class,
                    () -> controller.submitTransaction(makeTransaction("peb_report_violation")));
            assertTrue(ex.getMessage().contains("missing violation_type"));
        }

        @Test
        @DisplayName("RuntimeException propagates (not masked as 422)")
        void runtimeException_propagates() {
            stubException(new RuntimeException("DB connection lost"));

            RuntimeException ex = assertThrows(RuntimeException.class,
                    () -> controller.submitTransaction(makeTransaction("peb_validate_transition")));
            assertEquals("DB connection lost", ex.getMessage());
        }
    }
}
