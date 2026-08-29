package com.aibizarchitect.nexus.conformance.verifier;

/**
 * Raised when a fixture cannot be replayed (fail closed).
 *
 * Port of the Python reference's {@code ReplayError(ValueError)} in
 * {@code governance_envelope.replay}.
 */
public final class VerifierException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public VerifierException(String message) {
        super(message);
    }
}
