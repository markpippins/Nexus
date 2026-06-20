package org.nexus.peb.domain.enums;

import org.nexus.peb.domain.exception.MalformedAdmissionRequestException;

/**
 * The set of violation types recognized by the PEB Kernel. Values mirror the
 * MCP facade schema declared in
 * {@code typescript/peb-mcp/src/tools/index.ts} on
 * {@code peb_report_violation.violation_type}, but the Java enum pins them to
 * uppercase form. Parsing from MCP shape is centralized in
 * {@link #fromMcpValue(String)} so the bridge logic lives next to the values
 * and is unit-testable independently of {@code PebViolationEngine}.
 */
public enum ViolationType {
    AUTHORITY_LEAKAGE,
    STATE_DEPENDENCY,
    SEMANTIC_NORMALIZATION,
    RCL,
    TRANSFORM_INVALID;

    /**
     * Parse a value received from the MCP facade, where {@code violation_type}
     * arrives in lowercase snake_case (e.g. {@code authority_leakage},
     * {@code rcl_violation}) and is normalized onto this enum's uppercase
     * variants. The {@code _VIOLATION} suffix on {@code rcl_violation} is
     * stripped because {@link #RCL} does not carry the suffix.
     *
     * <p>Called from {@code PebViolationEngine.ingest}. Throws
     * {@link MalformedAdmissionRequestException} on null, blank, or
     * non-matching input so the controller's typed {@code @ExceptionHandler}
     * maps the failure to HTTP 422 with the original raw value attached to
     * the message.
     *
     * @throws MalformedAdmissionRequestException on null, blank, or unknown input.
     */
    public static ViolationType fromMcpValue(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new MalformedAdmissionRequestException(
                "violation_type is required and cannot be blank");
        }
        String normalized = raw.trim().toUpperCase().replaceAll("_VIOLATION$", "");
        try {
            return ViolationType.valueOf(normalized);
        } catch (IllegalArgumentException ex) {
            throw new MalformedAdmissionRequestException(
                "violation_type is not a known ViolationType: " + raw, ex);
        }
    }
}
