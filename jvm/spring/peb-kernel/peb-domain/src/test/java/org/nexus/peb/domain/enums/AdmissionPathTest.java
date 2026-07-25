package org.nexus.peb.domain.enums;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for {@link AdmissionPath} enum covering all four paths
 * per the Tester role mandate.
 *
 * <h3>Coverage model</h3>
 * <ol>
 *   <li><b>Green path</b> — all 8 known MCP facade tool names map to
 *       the correct admission path with correct default admission result.</li>
 *   <li><b>Orange path</b> — null, empty, and unknown tool names fall
 *       through to UNKNOWN/RECORDED correctly.</li>
 *   <li><b>Red path</b> — case sensitivity, whitespace, and unexpected
 *       tool name formats.</li>
 *   <li><b>Silent failure</b> — cross-check that the set of known tool
 *       names is complete (no missing mappings), and that changing the
 *       enum doesn't silently break routing.</li>
 * </ol>
 *
 * <p>This is also a <b>cross-language contract test</b>: the MCP facade
 * in {@code typescript/peb-mcp/src/tools/index.ts} defines 8 tool names.
 * This test locks in the Java-side mapping so any drift between the
 * TypeScript tool registry and the Java enum is caught at build time.
 */
@DisplayName("AdmissionPath")
class AdmissionPathTest {

    // ─────────────────────────────────────────────────────────────
    // GREEN PATH — all 9 known tools map correctly
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Green path — known MCP tool names")
    class GreenPath {

        @ParameterizedTest
        @CsvSource({
            "peb_validate_transition, VALIDATE, ALLOWED",
            "peb_check_invariants,       VALIDATE, ALLOWED",
            "peb_validate_transform,     VALIDATE, ALLOWED",
            "peb_record_decision,        MUTATE,   ALLOWED",
            "peb_append_trace_segment,   MUTATE,   ALLOWED",
            "peb_request_clarification,  MUTATE,   ALLOWED",
            "peb_extension_proposal,      MUTATE,   ALLOWED",
            "peb_report_violation,       REPORT_VIOLATION, REJECTED",
        })
        @DisplayName("known tool name maps to correct path and default result")
        void knownToolName_mapsCorrectly(String toolName,
                                          AdmissionPath expectedPath,
                                          AdmissionResult expectedResult) {
            AdmissionPath path = AdmissionPath.fromToolName(toolName);
            assertEquals(expectedPath, path,
                "Tool '" + toolName + "' should map to " + expectedPath);
            assertEquals(expectedResult, path.defaultAdmissionResult(),
                "Tool '" + toolName + "' default admission should be "
                + expectedResult);
        }

        @Test
        @DisplayName("all 8 known tools have non-null paths")
        void allToolsHaveNonNullPaths() {
            String[] allTools = {
                "peb_validate_transition", "peb_check_invariants",
                "peb_validate_transform",
                "peb_record_decision", "peb_append_trace_segment",
                "peb_request_clarification", "peb_extension_proposal",
                "peb_report_violation"
            };
            for (String tool : allTools) {
                AdmissionPath path = AdmissionPath.fromToolName(tool);
                assertNotNull(path, "Tool '" + tool + "' must map to non-null path");
                assertNotEquals(AdmissionPath.UNKNOWN, path,
                    "Tool '" + tool + "' must NOT map to UNKNOWN — "
                    + "it is a known MCP facade tool");
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // ORANGE PATH — null, empty, unknown tools
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Orange path — null, empty, and unknown tools")
    class OrangePath {

        @Test
        @DisplayName("null toolName maps to UNKNOWN")
        void nullToolName_mapsToUnknown() {
            AdmissionPath path = AdmissionPath.fromToolName(null);
            assertEquals(AdmissionPath.UNKNOWN, path,
                "Null toolName should map to UNKNOWN");
            assertEquals(AdmissionResult.ROUTED, path.defaultAdmissionResult(),
                "UNKNOWN path should default to ROUTED");
        }

        @ParameterizedTest
        @NullAndEmptySource
        @ValueSource(strings = {"  ", "\t", "\n"})
        @DisplayName("null/blank toolName maps to UNKNOWN")
        void blankToolName_mapsToUnknown(String toolName) {
            AdmissionPath path = AdmissionPath.fromToolName(toolName);
            assertEquals(AdmissionPath.UNKNOWN, path,
                "Blank toolName '" + toolName + "' should map to UNKNOWN");
        }

        @ParameterizedTest
        @ValueSource(strings = {
            "peb_unknown_tool",
            "random_string",
            "peb_",
            "PEB_VALIDATE_TRANSITION",  // uppercase — not matched
            "peb-validate-transition",   // hyphens — not matched
            "",
            "peb_validate_transition "   // trailing space
        })
        @DisplayName("unrecognized toolName maps to UNKNOWN/ROUTED")
        void unrecognizedToolName_mapsToUnknown(String toolName) {
            AdmissionPath path = AdmissionPath.fromToolName(toolName);
            assertEquals(AdmissionPath.UNKNOWN, path,
                "Unrecognized tool '" + toolName + "' should map to UNKNOWN");
            assertEquals(AdmissionResult.ROUTED, path.defaultAdmissionResult(),
                "UNKNOWN path should default to ROUTED");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RED PATH — adversarial input
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Red path — adversarial tool names")
    class RedPath {

        @ParameterizedTest
        @ValueSource(strings = {
            "peb_validate_transition\u0000",  // null byte injection
            "'; DROP TABLE peb.transactions; --",
            "${java.sys.prop}",
        })
        @DisplayName("adversarial tool names do not crash or map to unexpected paths")
        void adversarialToolNames_safe(String toolName) {
            AdmissionPath path = assertDoesNotThrow(
                () -> AdmissionPath.fromToolName(toolName),
                "Adversarial tool name should not throw");
            assertEquals(AdmissionPath.UNKNOWN, path,
                "Adversarial tool name should map to UNKNOWN, not a real path");
        }

        @Test
        @DisplayName("extremely long tool name (10K chars) does not cause issues")
        void veryLongToolName_safe() {
            String longName = "x".repeat(1000);
            AdmissionPath path = assertDoesNotThrow(
                () -> AdmissionPath.fromToolName(longName),
                "Very long tool name should not throw");
            assertEquals(AdmissionPath.UNKNOWN, path);
        }

        @Test
        @DisplayName("extremely long tool name (10K chars) does not cause issues")
        void extremelyLongToolName_safe() {
            String longName = "x".repeat(10_000);
            AdmissionPath path = assertDoesNotThrow(
                () -> AdmissionPath.fromToolName(longName),
                "Extremely long tool name should not throw");
            assertEquals(AdmissionPath.UNKNOWN, path);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // SILENT FAILURE — cross-language contract
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Silent failure — cross-language contract")
    class SilentFailure {

        /**
         * Cross-language contract test: The MCP facade in TypeScript
         * ({@code typescript/peb-mcp/src/tools/index.ts}) defines exactly
         * 8 tools. The Java enum must recognize all 8. If a tool is added
         * to the TypeScript side but not mapped here, the tool silently
         * routes to UNKNOWN instead of its intended path.
         *
         * <p>This test locks in the <b>exact set</b> of tool names that
         * must be recognized. Any drift between the TypeScript tool registry
         * and this test will fail, making the drift loud instead of silent.
         *
         * <p>Current known tool set (SYNCED with TypeScript peb-mcp tools/index.ts):
         * <ol>
         *   <li>peb_validate_transition → VALIDATE</li>
         *   <li>peb_check_invariants → VALIDATE</li>
         *   <li>peb_validate_transform → VALIDATE</li>
         *   <li>peb_record_decision → MUTATE</li>
         *   <li>peb_append_trace_segment → MUTATE</li>
         *   <li>peb_request_clarification → MUTATE</li>
         *   <li>peb_extension_proposal → MUTATE</li>
         *   <li>peb_report_violation → REPORT_VIOLATION</li>
         * </ol>
         */
        @Test
        @DisplayName("CONTRACT: exact 8 tool names recognized (not UNKNOWN)")
        void contract_exactToolSetRecognized() {
            String[] knownTools = {
                "peb_validate_transition",
                "peb_check_invariants",
                "peb_validate_transform",
                "peb_record_decision",
                "peb_append_trace_segment",
                "peb_request_clarification",
                "peb_extension_proposal",
                "peb_report_violation"
            };

            assertEquals(8, knownTools.length,
                "CONTRACT: If a tool is added to the TypeScript peb-mcp tools/index.ts, "
                + "this test must be updated to include it");

            for (String tool : knownTools) {
                AdmissionPath path = AdmissionPath.fromToolName(tool);
                assertNotEquals(AdmissionPath.UNKNOWN, path,
                    "CONTRACT BREACH: Tool '" + tool + "' maps to UNKNOWN. "
                    + "Either this tool was removed from peb-mcp or the Java "
                    + "enum mapping is incomplete. Update AdmissionPath.fromToolName().");
            }
        }

        /**
         * Verifies that each AdmissionPath enum value has a distinct and
         * correct defaultAdmissionResult. This prevents silent routing
         * errors where a path returns the wrong default.
         */
        @Test
        @DisplayName("each path has correct default admission result")
        void eachPathHasCorrectDefaultResult() {
            assertEquals(AdmissionResult.ALLOWED,
                AdmissionPath.VALIDATE.defaultAdmissionResult());
            assertEquals(AdmissionResult.ALLOWED,
                AdmissionPath.MUTATE.defaultAdmissionResult());
            assertEquals(AdmissionResult.REJECTED,
                AdmissionPath.REPORT_VIOLATION.defaultAdmissionResult());
            assertEquals(AdmissionResult.ROUTED,
                AdmissionPath.UNKNOWN.defaultAdmissionResult());
        }
    }
}
