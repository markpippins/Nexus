package com.aibizarchitect.nexus.conformance.verifier;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;

/**
 * Evaluation fingerprint (W1.04 §3) — independent JVM re-derivation.
 *
 * fingerprint = "sha256:" + hex(SHA-256(canonical_json(envelope minus its own
 * fingerprint group))). Same contract as the Python reference; no shared code.
 */
public final class Fingerprints {

    private Fingerprints() {
    }

    /** Evaluate the {@code evaluation_fingerprint} of an envelope. */
    public static String evaluateFingerprint(Map<String, Object> envelope) {
        if (envelope == null) {
            throw new CanonicalizationException("envelope must be an object");
        }
        Map<String, Object> stripped = Canonicalizer.stripTopLevel(envelope);
        Object canonical = Canonicalizer.canonicalize(stripped, "envelope");
        String payload = CanonicalJson.write(canonical);
        return "sha256:" + sha256Hex(payload);
    }

    /** Byte-stable identifier for cross-runtime agreement (W1.09 AC4). */
    public static String envelopeDigest(Map<String, Object> envelope) {
        Object canonical = Canonicalizer.canonicalize(envelope, "envelope");
        String payload = CanonicalJson.write(canonical);
        return "sha256:" + sha256Hex(payload);
    }

    static String sha256Hex(String payload) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
