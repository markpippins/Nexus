package com.aibizarchitect.nexus.conformance.verifier;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * W2.04 standalone verifier — consumes the W1.09 replay fixtures + manifest
 * and independently reproduces the Python verifier's guarantees:
 *
 * <ul>
 *   <li>byte-identical verification of the 9 emitted JVM agreement vectors
 *       (evaluation_fingerprint + canonical_payload_sha256),</li>
 *   <li>independent classification of the 7 intentional drift mutations with
 *       the same taxonomy (drift, refusal→stale_doctrine, unknown,
 *       duplicate-retry),</li>
 *   <li>evaluation fingerprint parity: identical fingerprints between the
 *       Python emit (stored in the manifest) and this JVM re-derivation,</li>
 *   <li>corpus verdicts per fixture (F01..F07) matching the Python harness
 *       expectations,</li>
 *   <li>determinism: every fixture replayed twice, verdicts compared.</li>
 * </ul>
 *
 * Exit codes: 0 = all green, 2 = failures (same convention as the Python
 * harness {@code bin/run_replay_conformance.py}).
 *
 * Usage:
 * <pre>
 *   java -cp target/classes com.aibizarchitect.nexus.conformance.verifier.ConformanceVerifier \
 *        --fixtures &lt;replay_fixtures dir&gt; --manifest &lt;jvm/expected-digests.json&gt;
 * </pre>
 */
public final class ConformanceVerifier {

    @SuppressWarnings("unchecked")
    public static void main(String[] args) throws Exception {
        String fixturesDir = null;
        String manifestPath = null;
        for (int i = 0; i < args.length - 1; i++) {
            switch (args[i]) {
                case "--fixtures" -> fixturesDir = args[i + 1];
                case "--manifest" -> manifestPath = args[i + 1];
                default -> {
                }
            }
        }
        if (fixturesDir == null || manifestPath == null) {
            System.err.println("usage: ConformanceVerifier --fixtures <dir> --manifest <expected-digests.json>");
            System.exit(2);
        }

        List<String> failures = new ArrayList<>();
        List<Map<String, Object>> corpus = new ArrayList<>();
        try (var files = Files.list(Path.of(fixturesDir))) {
            List<Path> paths = files.filter(p -> p.toString().endsWith(".json")).sorted().toList();
            for (Path p : paths) {
                corpus.add((Map<String, Object>) JsonParser.parse(Files.readString(p, StandardCharsets.UTF_8)));
            }
        }
        if (corpus.size() != 7) {
            System.err.println("FATAL: expected 7 fixtures, found " + corpus.size());
            System.exit(2);
        }
        Map<String, Object> manifest = (Map<String, Object>) JsonParser.parse(
                Files.readString(Path.of(manifestPath), StandardCharsets.UTF_8));
        List<Map<String, Object>> vectors = (List<Map<String, Object>>) manifest.get("vectors");

        // --- vector-by-vector fingerprint parity -----------------------------
        System.out.println("[AC4] JVM agreement vectors (" + vectors.size() + "):");
        for (Map<String, Object> vector : vectors) {
            String fixtureId = String.valueOf(vector.get("fixture"));
            long attempt = ((Number) vector.get("attempt_index")).longValue();
            Map<String, Object> doc = findDoc(corpus, fixtureId);
            Map<String, Object> envelope = attemptEnvelope(doc, (int) attempt);

            String jvmFingerprint = Fingerprints.evaluateFingerprint(stripFingerprintGroup(envelope));
            String jvmPayloadDigest = Fingerprints.envelopeDigest(envelope);
            String pyFingerprint = String.valueOf(vector.get("evaluation_fingerprint"));
            String pyPayload = String.valueOf(vector.get("canonical_payload_sha256"));

            boolean fpOk = jvmFingerprint.equals(pyFingerprint);
            boolean payloadOk = jvmPayloadDigest.equals(pyPayload);
            System.out.println("  [" + (fpOk && payloadOk ? "OK  " : "FAIL") + "] "
                    + fixtureId + "[" + attempt + "]"
                    + (fpOk && payloadOk ? "" : "  fp=" + jvmFingerprint + " payload=" + jvmPayloadDigest));
            if (!fpOk) {
                failures.add(fixtureId + "[" + attempt + "] evaluation_fingerprint mismatch");
            }
            if (!payloadOk) {
                failures.add(fixtureId + "[" + attempt + "] canonical_payload_sha256 mismatch");
            }
        }

        // --- corpus verdicts --------------------------------------------------
        System.out.println("corpus verdicts:");
        for (Map<String, Object> doc : corpus) {
            String fid = String.valueOf(doc.get("fixture_id"));
            List<Map<String, Object>> attempts = (List<Map<String, Object>>) doc.get("attempts");
            List<Map<String, Object>> expectedOutcomes =
                    (List<Map<String, Object>>) doc.get("expected_outcomes");
            boolean retry = Boolean.TRUE.equals(doc.get("retry_after_admission"));
            StringBuilder verdicts = new StringBuilder();
            for (int idx = 0; idx < attempts.size(); idx++) {
                Map<String, Object> view = new LinkedHashMap<>();
                view.put("law_registry", doc.get("law_registry"));
                view.put("contract_registry", doc.get("contract_registry"));
                view.put("expected", expectedOutcomes.get(idx));
                view.put("prior_admission_consumed", retry && idx > 0);
                view.put("envelope", attempts.get(idx).get("envelope"));

                Map<String, Object> verdict = Replayer.replay(view);
                verdicts.append(verdict.get("verdict")).append(" ");

                // AC2 determinism: identical second replay.
                Map<String, Object> verdict2 = Replayer.replay(view);
                if (!CanonicalJson.write(verdict).equals(CanonicalJson.write(verdict2))) {
                    failures.add(fid + "[" + idx + "] nondeterministic replay");
                }

                String expectedVerdict = String.valueOf(expectedOutcomes.get(idx).get("replay_verdict"));
                if (!verdict.get("verdict").equals(expectedVerdict)) {
                    failures.add(fid + "[" + idx + "] verdict=" + verdict.get("verdict")
                            + " (want " + expectedVerdict + ")");
                }
            }
            System.out.println("  " + fid + ": " + verdicts.toString().trim());
        }

        // --- AC3/AC6 intentional-drift matrix (same 7 mutations as Python) ----
        System.out.println("[AC3] intentional-drift matrix:");
        Map<String, Object> baseDoc = findDoc(corpus, "F01_allow_with_receipt");
        Map<String, Object> baseView = new LinkedHashMap<>();
        baseView.put("law_registry", baseDoc.get("law_registry"));
        baseView.put("contract_registry", baseDoc.get("contract_registry"));
        baseView.put("expected", ((List<Map<String, Object>>) baseDoc.get("expected_outcomes")).get(0));
        baseView.put("prior_admission_consumed", false);
        @SuppressWarnings("unchecked")
        Map<String, Object> baseAttempt = (Map<String, Object>) ((List<?>) baseDoc.get("attempts")).get(0);
        baseView.put("envelope", baseAttempt.get("envelope"));

        String[][] driftMatrix = {
                {"contract.contract_digest", Replayer.DRIFT_CONTRACT},
                {"law.proposition_ids", Replayer.DRIFT_DOCTRINE},
                {"law.posture_ids", Replayer.DRIFT_DOCTRINE},
                {"law.frame_values", Replayer.DRIFT_FRAME},
                {"inputs.input_snapshot_id", Replayer.DRIFT_INPUT},
                {"evaluation.evaluated_at", Replayer.DRIFT_EVALUATOR},
                {"authority.peb_transaction_id", Replayer.DRIFT_RECEIPT_LINEAGE},
        };
        for (String[] entry : driftMatrix) {
            String path = entry[0];
            String category = entry[1];
            Object value = path.contains("digest")
                    ? "sha256:" + "ff".repeat(32)
                    : path.equals("law.proposition_ids")
                            ? List.of("11111111-2222-4333-8444-555555555555")
                            : path.equals("law.frame_values")
                                    ? List.of(Map.of("frame", "execution_backend", "value", "batch"),
                                            Map.of("frame", "environment", "value", "production"))
                                    : path.equals("evaluation.evaluated_at")
                                            ? "2026-08-26T14:41:26.000000Z"
                                            : null;
            Map<String, Object> out = Replayer.driftVerdict(baseView, path, value);
            boolean signal = Boolean.TRUE.equals(out.get("signal_emitted"));
            boolean categoryOk = category.equals(out.get("category"));
            System.out.println("  [" + (signal && categoryOk ? "CAUGHT" : "WRONG") + "] "
                    + path + " cat=" + out.get("category"));
            if (!signal) {
                failures.add("drift matrix " + path + ": no signal");
            }
            if (!categoryOk) {
                failures.add("drift matrix " + path + ": misapplied taxonomy");
            }
        }

        if (!failures.isEmpty()) {
            System.out.println("FAILURES:");
            for (String f : failures) {
                System.out.println("  - " + f);
            }
            System.exit(2);
        }
        System.out.println("ALL GREEN");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> findDoc(List<Map<String, Object>> corpus, String fixtureId) {
        for (Map<String, Object> doc : corpus) {
            if (fixtureId.equals(doc.get("fixture_id"))) {
                return doc;
            }
        }
        throw new VerifierException("fixture not found in corpus: " + fixtureId);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> attemptEnvelope(Map<String, Object> doc, int idx) {
        List<Map<String, Object>> attempts = (List<Map<String, Object>>) doc.get("attempts");
        return (Map<String, Object>) attempts.get(idx).get("envelope");
    }

    /** Envelope minus its own fingerprint group (fingerprint input per W1.04). */
    private static Map<String, Object> stripFingerprintGroup(Map<String, Object> envelope) {
        Map<String, Object> core = Replayer.deepCopy(envelope);
        core.remove("fingerprint");
        return core;
    }
}
