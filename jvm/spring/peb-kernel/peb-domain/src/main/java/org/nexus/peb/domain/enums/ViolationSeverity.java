package org.nexus.peb.domain.enums;

import org.nexus.peb.domain.exception.MalformedAdmissionRequestException;

/**
 * The set of violation severities recognized by the PEB Kernel. Mirrors the
 * MCP facade schema on {@code peb_report_violation.severity}. Parsing from
 * MCP shape is centralized in {@link #fromMcpValue(String)} so the bridge
 * logic lives next to the values and is unit-testable independently of
 * {@code PebViolationEngine}.
 */
public enum ViolationSeverity {
    HARD,
    SOFT;

    /**
     * Parse a value received from the MCP facade, where {@code severity}
     * arrives in lowercase ({@code hard}, {@code soft}) and is normalized
     * onto this enum's uppercase variants.
     *
     * <p>Called from {@code PebViolationEngine.ingest}. Throws
     * {@link MalformedAdmissionRequestException} on null, blank, or
     * non-matching input so the controller's typed {@code @ExceptionHandler}
     * maps the failure to HTTP 422 with the original raw value attached to
     * the message.
     *
     * @throws MalformedAdmissionRequestException on null, blank, or unknown input.
     */
    public static ViolationSeverity fromMcpValue(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new MalformedAdmissionRequestException(
                "severity is required and cannot be blank");
        }
        String normalized = raw.trim().toUpperCase();
        try {
            return ViolationSeverity.valueOf(normalized);
        } catch (IllegalArgumentException ex) {
            throw new MalformedAdmissionRequestException(
                "severity is not a known ViolationSeverity: " + raw, ex);
        }
    }
}
