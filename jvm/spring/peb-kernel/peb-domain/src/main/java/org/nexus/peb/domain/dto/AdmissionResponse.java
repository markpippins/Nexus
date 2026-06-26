package org.nexus.peb.domain.dto;

/**
 * Result value produced by {@link org.nexus.peb.core.engine.PebGovernanceEngine#processForPath}
 * and consumed by the controller layer so it can choose the right HTTP status
 * code without relying on fragile string matching.
 *
 * @param message  Human-readable outcome text returned in the response body.
 * @param admitted {@code true} if the request passed admission (validator
 *                 allowed it, or the path bypasses the validator legitimately
 *                 such as REPORT_VIOLATION). {@code false} means the invariant
 *                 validator denied the request and the HTTP response should
 *                 reflect that (422 Unprocessable Entity).
 */
public record AdmissionResponse(String message, boolean admitted) {

    /**
     * Shortcut for an {@link #admitted() admitted} = {@code true} response.
     */
    public static AdmissionResponse accepted(String message) {
        return new AdmissionResponse(message, true);
    }

    /**
     * Shortcut for an {@link #admitted() admitted} = {@code false} response.
     */
    public static AdmissionResponse denied(String message) {
        return new AdmissionResponse(message, false);
    }
}
