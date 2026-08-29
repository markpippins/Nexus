package com.aibizarchitect.nexus.conformance.verifier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * W1.09 cross-runtime replay verification, JVM side (plan 0013 / W2.04).
 *
 * Coverage mirrors the Python conformance harness
 * ({@code bin/run_replay_conformance.py} + {@code tests/test_replay_conformance.py}):
 * corpus verdicts, AC2 determinism, AC3/AC6 drift taxonomy, fingerprint
 * round-trip, and AC5 structural purity. Nothing here imports, invokes, or
 * otherwise shares code with the Python reference implementation.
 */
@SuppressWarnings("unchecked") // raw JSON access in test assertions
class ReplayVerifierTest {

    // -------------------------------------------------------------------------
    // corpus (all 7 fixtures, all attempts) -> verdict sequences
    // -------------------------------------------------------------------------

    private static final Map<String, List<String>> EXPECTED_VERDICTS = Map.of(
            "F01_allow_with_receipt", List.of("replay_ok"),
            "F02_reject_plain", List.of("replay_ok"),
            "F03_refuse_unknown_context", List.of("replay_ok"),
            "F04_stale_doctrine", List.of("stale_doctrine"),
            "F05_contract_digest_drift", List.of("drift_confirmed"),
            "F06_duplicate_retry", List.of("replay_ok", "duplicate_retry"),
            "F07_doctrine_change_mid_workflow", List.of("replay_ok", "stale_doctrine"));

    static Stream<String> corpusWithExpected() {
        return EXPECTED_VERDICTS.keySet().stream().sorted();
    }

    @ParameterizedTest(name = "verdicts({0})")
    @MethodSource("corpusWithExpected")
    void everyFixtureReportsExpectedVerdictSequence(String fixtureId) {
        Map<String, Object> doc = FixtureSupport.loadFixture(fixtureId);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> attempts = (List<Map<String, Object>>) doc.get("attempts");
        List<String> got = new java.util.ArrayList<>();
        for (int i = 0; i < attempts.size(); i++) {
            Map<String, Object> verdict = Replayer.replay(FixtureSupport.view(doc, i));
            got.add(String.valueOf(verdict.get("verdict")));
            // fingerprint round-trip must hold for every replayable attempt
            Map<String, Object> attemptEnvelope = FixtureSupport.attemptEnvelope(doc, i);
            assertTrue(Replayer.fingerprintCheckOk(attemptEnvelope),
                    fixtureId + "[" + i + "] fingerprint round-trip");
        }
        assertEquals(EXPECTED_VERDICTS.get(fixtureId), got, fixtureId + " verdicts");
    }

    @Test
    void staleDoctrineAttackClassifiedAsDoctrine() {
        Map<String, Object> v = Replayer.replay(FixtureSupport.view(FixtureSupport.loadFixture("F04_stale_doctrine"), 0));
        assertEquals("stale_doctrine", v.get("verdict"));
        assertEquals(Replayer.DRIFT_DOCTRINE, v.get("category"));
    }

    @Test
    void contractDigestDriftClassifiedAsContract() {
        Map<String, Object> v = Replayer.replay(FixtureSupport.view(FixtureSupport.loadFixture("F05_contract_digest_drift"), 0));
        assertEquals("drift_confirmed", v.get("verdict"));
        assertEquals(Replayer.DRIFT_CONTRACT, v.get("category"));
    }

    @Test
    void duplicateRetryClassifiedAsReceiptLineage() {
        Map<String, Object> doc = FixtureSupport.loadFixture("F06_duplicate_retry");
        Map<String, Object> v = Replayer.replay(FixtureSupport.view(doc, 1));
        assertEquals("duplicate_retry", v.get("verdict"));
        assertEquals(Replayer.DRIFT_RECEIPT_LINEAGE, v.get("category"));
    }

    @Test
    void doctrineChangeMidWorkflowYieldsStaleOnSecondAttempt() {
        Map<String, Object> doc = FixtureSupport.loadFixture("F07_doctrine_change_mid_workflow");
        assertEquals("replay_ok",
                String.valueOf(Replayer.replay(FixtureSupport.view(doc, 0)).get("verdict")));
        assertEquals("stale_doctrine",
                String.valueOf(Replayer.replay(FixtureSupport.view(doc, 1)).get("verdict")));
    }

    // -------------------------------------------------------------------------
    // AC2 determinism: identical captured inputs -> identical verdict + fingerprint
    // -------------------------------------------------------------------------

    @ParameterizedTest(name = "determinism({0})")
    @MethodSource("corpusWithExpected")
    void replayIsDeterministicAcrossDoubleRun(String fixtureId) {
        Map<String, Object> doc = FixtureSupport.loadFixture(fixtureId);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> attempts = (List<Map<String, Object>>) doc.get("attempts");
        for (int i = 0; i < attempts.size(); i++) {
            Map<String, Object> view = FixtureSupport.view(doc, i);
            String a = CanonicalJson.write(Replayer.replay(view));
            String b = CanonicalJson.write(Replayer.replay(Replayer.deepCopy(view)));
            assertEquals(a, b, fixtureId + "[" + i + "] nondeterministic");
        }
    }

    @Test
    void canonicalPayloadDeterministicAcrossRepeats() {
        // Same envelope canonicalizes to identical SHA-256 bytes every time.
        Map<String, Object> envelope =
                FixtureSupport.attemptEnvelope(FixtureSupport.loadFixture("F01_allow_with_receipt"), 0);
        String first = Fingerprints.envelopeDigest(envelope);
        for (int i = 0; i < 5; i++) {
            assertEquals(first, Fingerprints.envelopeDigest(
                    Replayer.deepCopy(envelope)));
        }
    }

    // -------------------------------------------------------------------------
    // AC3 / AC6 intentional-drift matrix (same 7 as the Python harness)
    // -------------------------------------------------------------------------

    static Stream<String[]> driftMatrix() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("contract.contract_digest", Replayer.DRIFT_CONTRACT);
        m.put("law.proposition_ids", Replayer.DRIFT_DOCTRINE);
        m.put("law.posture_ids", Replayer.DRIFT_DOCTRINE);
        m.put("law.frame_values", Replayer.DRIFT_FRAME);
        m.put("inputs.input_snapshot_id", Replayer.DRIFT_INPUT);
        m.put("evaluation.evaluated_at", Replayer.DRIFT_EVALUATOR);
        m.put("authority.peb_transaction_id", Replayer.DRIFT_RECEIPT_LINEAGE);
        return m.entrySet().stream().map(e -> new String[]{e.getKey(), e.getValue()});
    }

    @ParameterizedTest(name = "drift({0})")
    @MethodSource("driftMatrix")
    void intentionalMutationYieldsClassifiedDrift(String path, String expectedCategory) {
        Map<String, Object> doc = FixtureSupport.loadFixture("F01_allow_with_receipt");
        Map<String, Object> baseView = FixtureSupport.view(doc, 0);
        Object value = mutationValue(path);
        Map<String, Object> out = Replayer.driftVerdict(baseView, path, value);
        assertTrue(Boolean.TRUE.equals(out.get("signal_emitted")), path + " must emit a signal");
        assertEquals(expectedCategory, String.valueOf(out.get("category")), path + " taxonomy");
    }

    private static Object mutationValue(String path) {
        if (path.contains("digest")) {
            return "sha256:" + "ff".repeat(32);
        }
        if (path.equals("law.proposition_ids")) {
            return List.of("11111111-2222-4333-8444-555555555555");
        }
        if (path.equals("law.posture_ids")) {
            return List.of("qqqqqqqq-2222-4333-8444-555555555555");
        }
        if (path.equals("law.frame_values")) {
            return List.of(
                    Map.of("frame", "execution_backend", "value", "batch"),
                    Map.of("frame", "environment", "value", "production"));
        }
        if (path.equals("evaluation.evaluated_at")) {
            return "2026-08-26T14:41:26.000000Z";
        }
        if (path.equals("inputs.input_snapshot_id")) {
            return "22222222-2222-4333-8444-555555555555";
        }
        return "aaaaaaaa-1111-4222-8333-000000000099";
    }

    @Test
    void unknownMutationPathFailsClosed() {
        assertThrows(VerifierException.class, () -> Replayer.classifyDrift("made.up.path"));
    }

    // -------------------------------------------------------------------------
    // AC4: evaluation fingerprint parity vs Python-emitted manifest
    // (tests are JVM-only, but the manifest is the byte-stable agreement surface)
    // -------------------------------------------------------------------------

    static Stream<String> manifestVectors() {
        List<String> out = new java.util.ArrayList<>();
        List<Map<String, Object>> vectors = FixtureSupport.asListMap(
                FixtureSupport.loadManifest().get("vectors"));
        for (Map<String, Object> v : vectors) {
            out.add(String.valueOf(v.get("fixture")) + "#" + v.get("attempt_index"));
        }
        return out.stream();
    }

    @ParameterizedTest(name = "fingerprint parity {0}")
    @MethodSource("manifestVectors")
    void evaluationFingerprintMatchesPythonEmit(String vectorKey) {
        String[] parts = vectorKey.split("#");
        Map<String, Object> doc = FixtureSupport.loadFixture(parts[0]);
        int attempt = Integer.parseInt(parts[1]);
        Map<String, Object> envelope =
                FixtureSupport.attemptEnvelope(doc, attempt);
        Map<String, Object> core = Replayer.deepCopy(envelope);
        core.remove("fingerprint");
        String jvm = Fingerprints.evaluateFingerprint(core);
        List<Map<String, Object>> vectors = FixtureSupport.asListMap(
                FixtureSupport.loadManifest().get("vectors"));
        String expected = null;
        for (Map<String, Object> v : vectors) {
            if (String.valueOf(v.get("fixture")).equals(parts[0])
                    && String.valueOf(v.get("attempt_index")).equals(parts[1])) {
                expected = String.valueOf(v.get("evaluation_fingerprint"));
                break;
            }
        }
        assertNotNull(expected, "vector not found " + vectorKey);
        assertEquals(expected, jvm, vectorKey + " fingerprint parity");
    }

    @Test
    void jvmAggreementSurfaceHasAllVectors() {
        int vectorCount = 0;
        for (Map<String, Object> doc : FixtureSupport.loadCorpus()) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> attempts = (List<Map<String, Object>>) doc.get("attempts");
            vectorCount += attempts.size();
        }
        List<Map<String, Object>> vectors = FixtureSupport.asListMap(
                FixtureSupport.loadManifest().get("vectors"));
        assertEquals(vectorCount, vectors.size(),
                "manifest must cover every corpus attempt (9 vectors)");
    }

    // -------------------------------------------------------------------------
    // AC5 purity: structural proof the verifier cannot do I/O.
    // Mirrors the Python AST import scan over src/governance_envelope/*.py —
    // here we assert no I/O-capable class is instantiated anywhere in the
    // package (a source scan analog).
    // -------------------------------------------------------------------------

    @Test
    void noFileSystemClassesInReplayPath() {
        // The replay/fingerprint path must contain zero I/O-capable types.
        String replaySrc = readResourceSafe();
        for (String forbidden : new String[]{"FileReader", "FileWriter", "Socket",
                "HttpClient", "DriverManager", "Connection", "Runtime.getRuntime().exec",
                "ProcessBuilder"}) {
            assertFalse(replaySrc.contains(forbidden),
                    "replay package references I/O-capable type: " + forbidden);
        }
    }

    private String readResourceSafe() {
        // The purity scan operates on the CONFORMANCE-VERIFIER package sources.
        // Module basedir is passed by Surefire as an absolute path; fall back to
        // cwd for IDEs that leave cwd at the module root.
        Path moduleBase = Path.of(System.getProperty(
                "replay.module.basedir", System.getProperty("user.dir")));
        Path base = moduleBase.resolve(
                "src/main/java/com/aibizarchitect/nexus/conformance/verifier");
        try (var stream = Files.newDirectoryStream(base, "*.java")) {
            StringBuilder sb = new StringBuilder();
            for (Path p : stream) {
                sb.append(Files.readString(p, StandardCharsets.UTF_8));
            }
            return sb.toString();
        } catch (java.io.IOException e) {
            throw new AssertionError(e);
        }
    }

    // -------------------------------------------------------------------------
    // fail-closed canonicalization (W1.04 §3.2)
    // -------------------------------------------------------------------------

    @Test
    void relativeIriFailsClosed() {
        Map<String, Object> env = baseEnvelope();
        digPut(env, "semantic.@context", "relative/path");
        Map<String, Object> core = Replayer.deepCopy(env);
        core.remove("fingerprint");
        assertThrows(CanonicalizationException.class,
                () -> Fingerprints.evaluateFingerprint(core));
    }

    @Test
    void naiveTimestampFailsClosed() {
        Map<String, Object> env = baseEnvelope();
        digPut(env, "created_at", "2026-08-26T06:41:44.868"); // no zone
        Map<String, Object> core = Replayer.deepCopy(env);
        core.remove("fingerprint");
        assertThrows(CanonicalizationException.class,
                () -> Fingerprints.evaluateFingerprint(core));
    }

    @Test
    void nanValueFailsClosed() {
        Map<String, Object> env = baseEnvelope();
        digPut(env, "evaluation.disposition", Double.NaN);
        Map<String, Object> core = Replayer.deepCopy(env);
        core.remove("fingerprint");
        assertThrows(CanonicalizationException.class,
                () -> Fingerprints.evaluateFingerprint(core));
    }

    @Test
    void duplicateJsonKeysFailsClosed() {
        String doc = "{\"envelope_id\":\"3b7e8f2a-1c4d-4e5f-9a0b-c6d7e8f9a0b1\","
                + "\"envelope_id\":\"00000000-0000-4000-8000-000000000000\"}";
        assertThrows(CanonicalizationException.class, () -> JsonParser.parse(doc));
    }

    /** Base F01 envelope (deep copy). */
    private static Map<String, Object> baseEnvelope() {
        return Replayer.deepCopy(
                FixtureSupport.attemptEnvelope(FixtureSupport.loadFixture("F01_allow_with_receipt"), 0));
    }

    /** Put a value at a dotted path inside a map (creating intermediate maps). */
    @SuppressWarnings("unchecked")
    private static void digPut(Map<String, Object> root, String dotted, Object value) {
        Map<String, Object> cur = root;
        String[] keys = dotted.split("\\.");
        for (int i = 0; i < keys.length - 1; i++) {
            Object next = cur.get(keys[i]);
            if (!(next instanceof Map)) {
                Map<String, Object> m = new LinkedHashMap<>();
                cur.put(keys[i], m);
                cur = m;
            } else {
                cur = (Map<String, Object>) next;
            }
        }
        cur.put(keys[keys.length - 1], value);
    }
}