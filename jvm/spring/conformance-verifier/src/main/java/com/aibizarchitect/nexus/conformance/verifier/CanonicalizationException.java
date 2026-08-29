package com.aibizarchitect.nexus.conformance.verifier;

/**
 * Raised when an envelope cannot be canonicalized (fail closed).
 *
 * Port of the Python reference's {@code FingerprintError(ValueError)} in
 * {@code governance_envelope.canonical}. The behavior contract is identical;
 * no code is shared.
 */
public final class CanonicalizationException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public CanonicalizationException(String message) {
        super(message);
    }
}
