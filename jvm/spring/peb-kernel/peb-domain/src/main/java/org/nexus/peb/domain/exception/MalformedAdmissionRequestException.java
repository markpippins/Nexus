package org.nexus.peb.domain.exception;

/**
 * Thrown by the kernel when an inbound admission request is structurally
 * fine (Jackson deserialized it) but its domain-shape is wrong — e.g.
 * {@code peb_report_violation} submitted without the textual
 * {@code violation_type} field, or with an enum value that doesn't map to
 * {@link org.nexus.peb.domain.enums.ViolationType}.
 *
 * <p>Carries HTTP semantics on purpose: a {@link MalformedAdmissionRequestException}
 * raised through a Spring {@code @ExceptionHandler} should map to
 * {@code 422 Unprocessable Entity}. {@link IllegalArgumentException} thrown
 * by other code paths (programmer bugs, JDK validation) should NOT be
 * silently swallowed as 422 — that's the whole reason this type exists
 * instead of catching the broad {@code IllegalArgumentException} parent.
 *
 * <p>Extends {@link RuntimeException} so Spring's {@code @Transactional}
 * rolls back any in-progress audit + violation saves when this is thrown
 * (see {@link org.nexus.peb.core.engine.PebGovernanceEngine#processForPath}).
 */
public class MalformedAdmissionRequestException extends RuntimeException {

    public MalformedAdmissionRequestException(String message) {
        super(message);
    }

    public MalformedAdmissionRequestException(String message, Throwable cause) {
        super(message, cause);
    }
}
