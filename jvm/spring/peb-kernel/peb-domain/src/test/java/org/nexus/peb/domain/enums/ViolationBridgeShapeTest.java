package org.nexus.peb.domain.enums;

import org.nexus.peb.domain.exception.MalformedAdmissionRequestException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Locks down the {@code MCP facade -> kernel enum} bridge shape established
 * in {@link ViolationType#fromMcpValue} and {@link ViolationSeverity#fromMcpValue}.
 *
 * <p>The bug class this guards against: prior to the refactor, the lowercase
 * MCP canonical values (e.g. {@code authority_leakage}, {@code rcl_violation},
 * {@code hard}) were being rejected at kernel admission as 422 Unprocessable
 * Entity, breaking end-to-end bridging from {@code PebApiClient}. The fix
 * moved the parsing onto the enums themselves; these tests pin the exact
 * shape so future regressions are caught at compile/test time.
 *
 * <p>Runs as a plain {@code mvn -pl pebble-domain test}. No Spring context
 * required — pure unit tests on the enums.
 */
class ViolationBridgeShapeTest {

    @Test
    void violation_type_lowercase_snake_case_inputs_map_to_java_enum() {
        // The canonical MCP-facade canonical-typos callers send today.
        assertEquals(ViolationType.AUTHORITY_LEAKAGE,
                     ViolationType.fromMcpValue("authority_leakage"));
        assertEquals(ViolationType.STATE_DEPENDENCY,
                     ViolationType.fromMcpValue("state_dependency"));
        assertEquals(ViolationType.SEMANTIC_NORMALIZATION,
                     ViolationType.fromMcpValue("semantic_normalization"));
        assertEquals(ViolationType.RCL,
                     ViolationType.fromMcpValue("rcl_violation"));   // _VIOLATION is stripped
        assertEquals(ViolationType.TRANSFORM_INVALID,
                     ViolationType.fromMcpValue("transform_invalid"));
    }

    @Test
    void violation_type_already_uppercase_inputs_still_match() {
        // Future callers who tighten their facade enum will send uppercase;
        // the kernel must still parse cleanly.
        assertEquals(ViolationType.AUTHORITY_LEAKAGE,
                     ViolationType.fromMcpValue("AUTHORITY_LEAKAGE"));
        assertEquals(ViolationType.RCL,
                     ViolationType.fromMcpValue("RCL"));
        assertEquals(ViolationType.TRANSFORM_INVALID,
                     ViolationType.fromMcpValue("TRANSFORM_INVALID"));
    }

    @Test
    void severity_lowercase_inputs_map_to_java_enum() {
        assertEquals(ViolationSeverity.HARD, ViolationSeverity.fromMcpValue("hard"));
        assertEquals(ViolationSeverity.SOFT, ViolationSeverity.fromMcpValue("soft"));
    }

    @Test
    void severity_already_uppercase_inputs_still_match() {
        assertEquals(ViolationSeverity.HARD, ViolationSeverity.fromMcpValue("HARD"));
        assertEquals(ViolationSeverity.SOFT, ViolationSeverity.fromMcpValue("SOFT"));
    }

    @Test
    void violation_type_rejects_null_blank_and_unknown() {
        assertThrows(MalformedAdmissionRequestException.class,
                     () -> ViolationType.fromMcpValue(null));
        assertThrows(MalformedAdmissionRequestException.class,
                     () -> ViolationType.fromMcpValue(""));
        assertThrows(MalformedAdmissionRequestException.class,
                     () -> ViolationType.fromMcpValue("   "));
        assertThrows(MalformedAdmissionRequestException.class,
                     () -> ViolationType.fromMcpValue("not_a_real_type"));
        // The "_VIOLATION" strip is asymmetric: only rcl_violation -> RCL,
        // arbitrary "x_violation" should NOT silently normalize to a known
        // enum value.
        assertThrows(MalformedAdmissionRequestException.class,
                     () -> ViolationType.fromMcpValue("x_violation"));
    }

    @Test
    void severity_rejects_null_blank_and_unknown() {
        assertThrows(MalformedAdmissionRequestException.class,
                     () -> ViolationSeverity.fromMcpValue(null));
        assertThrows(MalformedAdmissionRequestException.class,
                     () -> ViolationSeverity.fromMcpValue(""));
        assertThrows(MalformedAdmissionRequestException.class,
                     () -> ViolationSeverity.fromMcpValue("   "));
        assertThrows(MalformedAdmissionRequestException.class,
                     () -> ViolationSeverity.fromMcpValue("medium"));
    }
}
