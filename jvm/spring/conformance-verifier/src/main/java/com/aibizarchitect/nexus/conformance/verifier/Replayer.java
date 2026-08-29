package com.aibizarchitect.nexus.conformance.verifier;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Replay semantics for governance admission envelopes (W1.09) — independent
 * JVM re-derivation of the Python reference {@code governance_envelope.replay}.
 *
 * PURE evaluation layer over plain maps loaded from static fixture files: no
 * database, no network, no wall-clock (time enters only through captured
 * timestamps). Verdicts, drift taxonomy and law resolution mirror the Python
 * behavior; zero shared code.
 */
public final class Replayer {

    /** Drift categories (W1.09 AC6) — same vocabulary as the Python verifier. */
    public static final String DRIFT_CONTRACT = "contract";
    public static final String DRIFT_DOCTRINE = "doctrine";
    public static final String DRIFT_INPUT = "input";
    public static final String DRIFT_EVALUATOR = "evaluator";
    public static final String DRIFT_RECEIPT_LINEAGE = "receipt_lineage";
    public static final String DRIFT_FRAME = "frame";

    /** mutation point -> drift category for the AC3 matrix. */
    private static final Map<String, String> MUTATION_CATEGORY = Map.ofEntries(
            Map.entry("contract.contract_digest", DRIFT_CONTRACT),
            Map.entry("law.proposition_ids", DRIFT_DOCTRINE),
            Map.entry("law.posture_ids", DRIFT_DOCTRINE),
            Map.entry("law.frame_values", DRIFT_FRAME),
            Map.entry("inputs.input_snapshot_id", DRIFT_INPUT),
            Map.entry("inputs.input_fingerprint", DRIFT_INPUT),
            Map.entry("evaluation.evaluated_at", DRIFT_EVALUATOR),
            Map.entry("evaluation.disposition", DRIFT_EVALUATOR),
            Map.entry("evaluation.assertion_results", DRIFT_EVALUATOR),
            Map.entry("authority.peb_transaction_id", DRIFT_RECEIPT_LINEAGE),
            Map.entry("authority.admission_receipt_id", DRIFT_RECEIPT_LINEAGE));

    private Replayer() {
    }

    // -------------------------------------------------------------------------
    // law-snapshot resolution (supersession-by-insertion, valid-time selection)
    // -------------------------------------------------------------------------

    /** Rows in force at {@code asOf}: effective, not superseded before it. */
    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> resolveLawAsOf(
            Map<String, Object> registry, String kind, String asOf) {
        Object raw = registry.get(kind);
        if (!(raw instanceof List<?> rows)) {
            return List.of();
        }
        Map<String, List<Map<String, Object>>> entities = new LinkedHashMap<>();
        for (Object o : rows) {
            Map<String, Object> r = (Map<String, Object>) o;
            entities.computeIfAbsent(String.valueOf(r.get("entity_key")),
                    k -> new ArrayList<>()).add(r);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, Object>>> e : entities.entrySet()) {
            Map<String, Object> best = null;
            String bestFrom = null;
            long bestVersion = Long.MIN_VALUE;
            for (Map<String, Object> r : e.getValue()) {
                String from = String.valueOf(r.get("effective_from"));
                if (from.compareTo(asOf) > 0) {
                    continue;                                   // not yet in force
                }
                Object sup = r.get("superseded_at");
                if (sup != null && String.valueOf(sup).compareTo(asOf) <= 0) {
                    continue;                                   // superseded before as_of
                }
                long version = r.get("version") instanceof Number n ? n.longValue() : 0;
                if (best == null || from.compareTo(bestFrom) > 0
                        || (from.equals(bestFrom) && version > bestVersion)) {
                    best = r;
                    bestFrom = from;
                    bestVersion = version;
                }
            }
            if (best != null) {
                out.add(best);
            }
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // envelope integrity (fingerprint round-trip)
    // -------------------------------------------------------------------------

    /** Verify the stored fingerprint matches recomputation. */
    public static boolean fingerprintCheckOk(Map<String, Object> envelope) {
        Object claimed = dig(envelope, "fingerprint", "evaluation_fingerprint");
        if (!(claimed instanceof String s) || s.isEmpty()) {
            return false;
        }
        Map<String, Object> core = deepCopy(envelope);
        core.remove("fingerprint");
        try {
            return Fingerprints.evaluateFingerprint(core).equals(s);
        } catch (CanonicalizationException e) {
            return false;
        }
    }

    // -------------------------------------------------------------------------
    // replay verdicts
    // -------------------------------------------------------------------------

    private static String asOfFor(Map<String, Object> envelope) {
        Object effective = dig(envelope, "law", "effective_at");
        if (effective instanceof String s && !s.isEmpty()) {
            return s.replace("Z", "");
        }
        Object evaluated = dig(envelope, "evaluation", "evaluated_at");
        if (evaluated instanceof String s && !s.isEmpty()) {
            return s.replace("Z", "");
        }
        throw new VerifierException("fixture has no resolvable as-of timestamp");
    }

    /**
     * Replay one fixture view offline and produce a structured verdict.
     * Verdicts: replay_ok, stale_doctrine, drift_confirmed, duplicate_retry,
     * fingerprint_mismatch.
     */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> replay(Map<String, Object> view) {
        Map<String, Object> envelope = (Map<String, Object>) view.get("envelope");
        Map<String, Object> out = new LinkedHashMap<>();

        if (!fingerprintCheckOk(envelope)) {
            out.put("verdict", "fingerprint_mismatch");
            out.put("claimed", dig(envelope, "fingerprint", "evaluation_fingerprint"));
            return out;
        }
        String asOf = asOfFor(envelope);

        // Contract identity must match its registered artifact version.
        Map<String, Object> contract = (Map<String, Object>) envelope.get("contract");
        Object citedDigest = contract.get("contract_digest");
        boolean digestDrift = false;
        Object regRaw = view.get("contract_registry");
        if (regRaw instanceof List<?> rows) {
            for (Object o : rows) {
                Map<String, Object> r = (Map<String, Object>) o;
                if (String.valueOf(r.get("contract_id")).equals(String.valueOf(contract.get("contract_id")))
                        && String.valueOf(r.get("version")).equals(String.valueOf(contract.get("contract_version")))) {
                    if (!String.valueOf(r.get("digest")).equals(String.valueOf(citedDigest))) {
                        digestDrift = true;
                    }
                    break;
                }
            }
        }
        if (digestDrift) {
            out.put("verdict", "drift_confirmed");
            out.put("category", DRIFT_CONTRACT);
            out.put("detail", "registered artifact digest disagrees with envelope citation");
            return out;
        }

        // Doctrine / proposition / posture citations must still be in force.
        Map<String, Object> law = (Map<String, Object>) envelope.get("law");
        Map<String, Object> lawRegistry = (Map<String, Object>) view.get("law_registry");
        for (String field : List.of("doctrine_ids", "proposition_ids", "posture_ids")) {
            Object ids = law.get(field);
            if (!(ids instanceof List<?> idList)) {
                continue;
            }
            String kind = field.equals("doctrine_ids") ? "doctrines"
                    : field.equals("proposition_ids") ? "propositions" : "postures";
            List<String> inForce = new ArrayList<>();
            for (Map<String, Object> row : resolveLawAsOf(lawRegistry, kind, asOf)) {
                inForce.add(String.valueOf(row.get("entity_key")));
            }
            for (Object id : idList) {
                if (!inForce.contains(String.valueOf(id))) {
                    out.put("verdict", "stale_doctrine");
                    out.put("missing_" + (field.equals("doctrine_ids") ? "doctrine"
                            : field.equals("proposition_ids") ? "proposition" : "posture"),
                            String.valueOf(id));
                    out.put("category", DRIFT_DOCTRINE);
                    return out;
                }
            }
        }

        // Deterministic redigest: same captured inputs -> same fingerprint.
        Map<String, Object> core = deepCopy(envelope);
        core.remove("fingerprint");
        String redigest = Fingerprints.evaluateFingerprint(core);
        Map<String, Object> expected = (Map<String, Object>) view.get("expected");
        String expectedFp = String.valueOf(expected.get("evaluation_fingerprint"));
        if (!redigest.equals(expectedFp)) {
            out.put("verdict", "drift_confirmed");
            out.put("category", DRIFT_DOCTRINE);   // content changed under the citation
            out.put("stored", expectedFp);
            out.put("recomputed", redigest);
            return out;
        }

        // Duplicate retry: later attempts of an already-consumed admission.
        Object retry = view.get("prior_admission_consumed");
        if (Boolean.TRUE.equals(retry)) {
            Map<String, Object> receipt = expected.get("receipt") instanceof Map<?, ?> m
                    ? (Map<String, Object>) m : Map.of();
            out.put("verdict", "duplicate_retry");
            out.put("category", DRIFT_RECEIPT_LINEAGE);
            out.put("refusal_code_expected", "duplicate_reuse");
            out.put("prior_receipt_transaction", receipt.get("peb_transaction_id"));
            return out;
        }

        out.put("verdict", "replay_ok");
        out.put("disposition", dig(envelope, "evaluation", "disposition"));
        out.put("fingerprint", redigest);
        out.put("fingerprint_stable", true);
        out.put("purity_no_io", true);
        return out;
    }

    // -------------------------------------------------------------------------
    // intentional-drift probes
    // -------------------------------------------------------------------------

    /** Map a mutation point to its drift category (fail closed on unknowns). */
    public static String classifyDrift(String mutationPath) {
        String category = MUTATION_CATEGORY.get(mutationPath);
        if (category == null) {
            throw new VerifierException("unknown mutation path for drift taxonomy: " + mutationPath);
        }
        return category;
    }

    /** Apply a dotted-path mutation on a deep copy, returning the mutated envelope. */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> applyMutation(Map<String, Object> envelope,
                                                    String dotted, Object value) {
        Map<String, Object> mutated = deepCopy(envelope);
        Map<String, Object> target = mutated;
        String[] parts = dotted.split("\\.");
        for (int i = 0; i < parts.length - 1; i++) {
            Object next = target.get(parts[i]);
            if (!(next instanceof Map)) {
                next = new LinkedHashMap<String, Object>();
                target.put(parts[i], next);
            }
            target = (Map<String, Object>) next;
        }
        target.put(parts[parts.length - 1], value);
        return mutated;
    }

    /** Intentional-drift probe: recapture fingerprint after one mutation. */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> driftVerdict(Map<String, Object> view,
                                                   String mutationPath, Object newValue) {
        Map<String, Object> envelope = (Map<String, Object>) view.get("envelope");
        Map<String, Object> mutated = applyMutation(envelope, mutationPath, newValue);
        Map<String, Object> core = deepCopy(mutated);
        core.remove("fingerprint");
        String newFp = Fingerprints.evaluateFingerprint(core);
        Map<String, Object> expected = (Map<String, Object>) view.get("expected");
        String originalFp = String.valueOf(expected.get("evaluation_fingerprint"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mutation", mutationPath);
        out.put("category", classifyDrift(mutationPath));
        out.put("signal_emitted", !newFp.equals(originalFp));
        out.put("original_fingerprint", originalFp);
        out.put("mutated_fingerprint", newFp);
        return out;
    }

    // -------------------------------------------------------------------------
    // helpers
    // -------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    static Object dig(Map<String, Object> map, String... path) {
        Object cur = map;
        for (String key : path) {
            if (!(cur instanceof Map)) {
                return null;
            }
            cur = ((Map<String, Object>) cur).get(key);
        }
        return cur;
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> deepCopy(Map<String, Object> src) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : src.entrySet()) {
            Object v = e.getValue();
            if (v instanceof Map) {
                out.put(e.getKey(), deepCopy((Map<String, Object>) v));
            } else if (v instanceof List<?> l) {
                out.put(e.getKey(), deepCopyList(l));
            } else {
                out.put(e.getKey(), v);
            }
        }
        return out;
    }

    static List<Object> deepCopyList(List<?> l) {
        List<Object> out = new ArrayList<>(l.size());
        for (Object o : l) {
            if (o instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> m = (Map<String, Object>) o;
                out.add(deepCopy(m));
            } else if (o instanceof List<?> inner) {
                out.add(deepCopyList(inner));
            } else {
                out.add(o);
            }
        }
        return out;
    }
}
