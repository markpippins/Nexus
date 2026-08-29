package com.aibizarchitect.nexus.conformance.verifier;

import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Shared test scaffolding: locates the W1.09 fixtures and manifest relative to
 * the project root and builds replay "views" in the same shape the Python
 * harness uses. Deliberately mirrors {@code nexus/python/governance-envelope/
 * tests/fixtures.py} semantics — independent code, no shared classes.
 */
public final class FixtureSupport {

    /**
     * Locate the W1.09 fixtures + manifest. Prefers the absolute path that the
     * module POM passes to Surefire ({@code replay.fixtures.dir} etc.), which works
     * regardless of the working directory Maven uses; falls back to a relative
     * walk when run outside Maven (e.g. IDE).
     */
    static final Path FIXTURE_DIR = Path.of(System.getProperty(
            "replay.fixtures.dir",
            Path.of("").toAbsolutePath().resolve("../../../../python/governance-envelope/replay_fixtures").normalize().toString()));
    static final Path MANIFEST = Path.of(System.getProperty(
            "replay.manifest.path",
            Path.of("").toAbsolutePath().resolve("../../../../python/governance-envelope/jvm/expected-digests.json").normalize().toString()));

    private FixtureSupport() {
    }

    static Map<String, Object> loadFixture(String fixtureId) {
        Map<String, Object> doc = parseJson(FIXTURE_DIR.resolve(fixtureId + ".json"));
        if (!fixtureId.equals(doc.get("fixture_id"))) {
            throw new IllegalStateException("bad fixture " + fixtureId);
        }
        return doc;
    }

    static List<Map<String, Object>> loadCorpus() {
        List<Map<String, Object>> out = new ArrayList<>();
        try (var stream = Files.list(FIXTURE_DIR)) {
            List<Path> paths = stream.filter(p -> p.toString().endsWith(".json")).sorted().toList();
            for (Path p : paths) {
                out.add(parseJson(p));
            }
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
        return out;
    }

    static Map<String, Object> parseJson(Path p) {
        try {
            return asMap(JsonParser.parse(Files.readString(p, StandardCharsets.UTF_8)));
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    /** The W1.09 agreement manifest (Python-emitted digests). */
    static Map<String, Object> loadManifest() {
        return parseJson(MANIFEST);
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> asMap(Object o) {
        return (Map<String, Object>) o;
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> asListMap(Object o) {
        return (List<Map<String, Object>>) o;
    }

    /** Build a replay view for a given attempt of a fixture (0-based). */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> view(Map<String, Object> doc, int idx) {
        List<Map<String, Object>> attempts = (List<Map<String, Object>>) doc.get("attempts");
        List<Map<String, Object>> outcomes = (List<Map<String, Object>>) doc.get("expected_outcomes");
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("law_registry", doc.get("law_registry"));
        view.put("contract_registry", doc.get("contract_registry"));
        view.put("expected", outcomes.get(idx));
        view.put("prior_admission_consumed",
                Boolean.TRUE.equals(doc.get("retry_after_admission")) && idx > 0);
        view.put("envelope", attempts.get(idx).get("envelope"));
        return view;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> attemptEnvelope(Map<String, Object> doc, int idx) {
        return (Map<String, Object>) ((List<Map<String, Object>>) doc.get("attempts"))
                .get(idx).get("envelope");
    }

}