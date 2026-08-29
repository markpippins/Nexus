package com.aibizarchitect.nexus.conformance.verifier;

import java.math.BigInteger;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * W1.04 canonicalization — independent JVM re-derivation.
 *
 * Implements the byte-level rules of
 * {@code nexus/docs/governance-envelope-serialization.md} §2 against the same
 * semantics as the Python reference {@code governance_envelope.canonical}
 * (behavior parity, zero shared code):
 *
 * <ul>
 *   <li>UUID fields → lowercase canonical 8-4-4-4-12 (hyphen-less and
 *       uppercase input normalized; non-UUID opaque ids pass through),</li>
 *   <li>timestamp fields → RFC 3339 UTC with {@code Z} and exactly 6
 *       fractional digits; naive timestamps fail closed,</li>
 *   <li>IRI fields → RFC 3986 §6.2.2 syntax-based normalization; relative
 *       IRIs fail closed,</li>
 *   <li>numbers → integral floats collapse to integer shape; NaN/Infinity
 *       fail closed,</li>
 *   <li>decimal strings → canonical decimal (no leading zeros, no trailing
 *       fraction zeros, no exponent),</li>
 *   <li>strings → NFC, BOM stripped, Cf (format) characters removed,</li>
 *   <li>set-ordered arrays sorted by canonical element serialization;
 *       ordered arrays preserved,</li>
 *   <li>map keys normalized as strings; object key order is irrelevant
 *       because the writer sorts,</li>
 *   <li>unknown/excluded top-level keys are stripped by
 *       {@link #stripTopLevel} before canonicalization (architect ruling
 *       2026-08-27).</li>
 * </ul>
 */
public final class Canonicalizer {

    private Canonicalizer() {
    }

    // -------------------------------------------------------------------------
    // field tables (W1.01 field contract + W1.04 spec) — same membership as the
    // Python reference; the tables themselves are spec data, not shared code.
    // -------------------------------------------------------------------------

    private static final Set<String> UUID_FIELDS = Set.of(
            "envelope_id", "subject_id", "workflow_id", "node_id", "work_request_id",
            "lease_id", "grant_id", "attempt_id", "input_snapshot_id",
            "proposition_ids", "doctrine_ids", "posture_ids", "evidence_ids",
            "peb_transaction_id", "admission_receipt_id", "sanctioned_transition_id");

    private static final Set<String> TS_FIELDS = Set.of(
            "created_at", "effective_at", "input_captured_at", "evaluated_at");

    private static final Set<String> IRI_FIELDS = Set.of("@context", "subject_ref");

    /** Set-ordered array fields (sorted by canonical element serialization). */
    private static final Set<String> SET_ARRAY_FIELDS = Set.of(
            "proposition_ids", "doctrine_ids", "posture_ids", "frame_values",
            "evidence_ids", "unknowns");

    /** Ordered array fields (producer order preserved). */
    private static final Set<String> ORDERED_ARRAY_FIELDS = Set.of(
            "assertion_results", "diagnostics");

    /** Top-level keys that ARE part of the authority-relevant envelope (W1.01). */
    private static final Set<String> ALLOWED_TOP_KEYS = Set.of(
            "envelope_version", "envelope_id", "created_at",
            "contract", "semantic", "workflow", "law", "execution",
            "inputs", "evaluation", "evidence", "fingerprint", "authority");

    /** Non-authoritative transport metadata, deliberately excluded (W1.01). */
    private static final Set<String> EXCLUDED_TOP_KEYS = Set.of(
            "transport", "metadata", "broker", "headers");

    private static final Pattern UUID_RE = Pattern.compile(
            "^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$");

    private static final Pattern DECIMAL_RE = Pattern.compile("^-?(0|[1-9]\\d*)(\\.\\d+)?$");

    // -------------------------------------------------------------------------
    // public entry points
    // -------------------------------------------------------------------------

    /** Strip excluded + unknown top-level keys (architect ruling 2026-08-27). */
    public static Map<String, Object> stripTopLevel(Map<String, Object> envelope) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : envelope.entrySet()) {
            if (!EXCLUDED_TOP_KEYS.contains(e.getKey())
                    && ALLOWED_TOP_KEYS.contains(e.getKey())) {
                out.put(e.getKey(), e.getValue());
            }
        }
        return out;
    }

    /** Recursively normalize a value for canonical serialization. */
    public static Object canonicalize(Object value, String key) {
        if (value == null) {
            return null;
        }
        if (value instanceof Boolean) {
            return value;
        }
        if (value instanceof String s) {
            String normalized = normString(s);
            if (key != null && UUID_FIELDS.contains(key)) {
                return normUuid(normalized);
            }
            if (key != null && TS_FIELDS.contains(key)) {
                return normTimestamp(normalized);
            }
            if (key != null && IRI_FIELDS.contains(key)) {
                return normIri(normalized);
            }
            return normalized;
        }
        if (value instanceof Double d) {
            return normNumber(d);
        }
        if (value instanceof Float f) {
            return normNumber(f.doubleValue());
        }
        if (value instanceof Long || value instanceof Integer || value instanceof Short
                || value instanceof Byte || value instanceof BigInteger) {
            return value;
        }
        if (value instanceof Map<?, ?> m) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : m.entrySet()) {
                String k = normString(String.valueOf(e.getKey()));
                out.put(k, canonicalize(e.getValue(), k));
            }
            return out;
        }
        if (value instanceof List<?> l) {
            List<Object> out = new ArrayList<>(l.size());
            for (Object item : l) {
                out.add(canonicalize(item, key));
            }
            if (key != null && SET_ARRAY_FIELDS.contains(key)) {
                out.sort(Canonicalizer::canonicalElementCompare);
            }
            return out;
        }
        throw new CanonicalizationException(
                "unsupported value type for " + key + ": " + value.getClass().getName());
    }

    /** Sort key for set-ordered arrays: canonical element serialization. */
    private static int canonicalElementCompare(Object a, Object b) {
        return CanonicalJson.write(a).compareTo(CanonicalJson.write(b));
    }

    // -------------------------------------------------------------------------
    // scalar normalizers
    // -------------------------------------------------------------------------

    /** Normalize a UUID to lowercase 8-4-4-4-12; opaque ids pass through. */
    static String normUuid(String value) {
        String s = value.trim();
        if (!UUID_RE.matcher(s).matches()) {
            return s;
        }
        if (s.indexOf('-') < 0) {
            s = s.substring(0, 8) + "-" + s.substring(8, 12) + "-" + s.substring(12, 16)
                    + "-" + s.substring(16, 20) + "-" + s.substring(20, 32);
        }
        return s.toLowerCase(java.util.Locale.ROOT);
    }

    /** RFC 3339 UTC with Z and exactly 6 fractional digits; fail closed on naive input. */
    static String normTimestamp(Object value) {
        if (value instanceof Number n) {
            // Numeric input: epoch seconds or epoch microseconds (Python
            // numeric path rounds to microsecond precision via datetime).
            double v = n.doubleValue();
            if (Double.isNaN(v) || Double.isInfinite(v)) {
                throw new CanonicalizationException("NaN/Infinity timestamp: " + value);
            }
            if (v > 1.0E12) { // epoch microseconds
                v = v / 1.0E6;
            }
            long epochMicros;
            if (v == Math.rint(v)) {
                epochMicros = Math.round(v * 1.0E6);
            } else {
                // seconds with fraction: roundtrip via nanoseconds without
                // rounding away sub-microsecond digits prematurely.
                epochMicros = Math.round(v * 1.0E6);
            }
            java.time.Instant instant = java.time.Instant.ofEpochSecond(
                    Math.floorDiv(epochMicros, 1_000_000L),
                    Math.floorMod(epochMicros, 1_000_000L) * 1000L);
            return formatUtc6EpochNano(instant.getEpochSecond(), (long) instant.getNano());
        }
        if (value instanceof String s0) {
            String s = s0.trim();
            java.time.Instant instant;
            try {
                instant = parseIsoInstant(s);
            } catch (java.time.DateTimeException e) {
                throw new CanonicalizationException("unparseable timestamp: " + value);
            }
            int micros = instant.getNano() / 1000; // truncate to microsecond (Python %f parity)
            return formatUtc6EpochNano(instant.getEpochSecond(), (long) micros * 1000L);
        }
        throw new CanonicalizationException("unsupported timestamp value: " + value);
    }

    /** Parse an RFC 3339 instant preserving full nanosecond precision (micro truncation happens after). */
    private static java.time.Instant parseIsoInstant(String s) {
        boolean zSuffix = s.endsWith("Z") || s.endsWith("z");
        String body = zSuffix ? s.substring(0, s.length() - 1) : s;
        int dot = body.lastIndexOf('.');
        java.time.LocalDateTime ldt;
        if (dot >= 0) {
            // Fractional seconds: use a formatter that preserves the fraction.
            java.time.format.DateTimeFormatter fmt = new java.time.format.DateTimeFormatterBuilder()
                    .append(java.time.format.DateTimeFormatter.ISO_LOCAL_DATE)
                    .appendLiteral('T')
                    .append(java.time.format.DateTimeFormatter.ISO_LOCAL_TIME)
                    .toFormatter();
            ldt = java.time.LocalDateTime.parse(body, fmt);
        } else {
            java.time.format.DateTimeFormatter fmt = new java.time.format.DateTimeFormatterBuilder()
                    .append(java.time.format.DateTimeFormatter.ISO_LOCAL_DATE)
                    .appendLiteral('T')
                    .appendPattern("HH:mm:ss")
                    .toFormatter();
            try {
                ldt = java.time.LocalDateTime.parse(body, fmt);
            } catch (java.time.DateTimeException e) {
                // Fall back to full ISO local time (some inputs carry seconds with offset only).
                ldt = java.time.LocalDateTime.parse(body,
                        java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            }
        }
        // Offset conversion (must be +00:00/offset -> UTC; naive fails closed below).
        int sign = body.indexOf('+');
        if (sign >= 0) {
            // Offset is carried in `s` (e.g. "...+05:30" or "...-0800"); parse
            // it from the original and apply to the wall time.
            java.time.OffsetDateTime odt = java.time.OffsetDateTime.parse(s);
            java.time.ZoneOffset offset = odt.getOffset();
            return ldt.atOffset(offset).toInstant();
        }
        // Timestamp is UTC (Z suffix) with no numeric offset.
        if (zSuffix) {
            return ldt.atOffset(java.time.ZoneOffset.UTC).toInstant();
        }
        // Naive timestamp (no zone, no offset) — fail closed per W1.04 §2.4.
        throw new CanonicalizationException("naive timestamp (must carry zone): " + s);
    }

    private static String formatUtc6EpochNano(long epochSecond, long nanoOfSecond) {
        java.time.ZonedDateTime zdt = java.time.Instant.ofEpochSecond(epochSecond, nanoOfSecond)
                .atZone(java.time.ZoneOffset.UTC);
        long micros = nanoOfSecond / 1000; // already truncated
        return String.format(java.util.Locale.ROOT,
                "%04d-%02d-%02dT%02d:%02d:%02d.%06dZ",
                zdt.getYear(), zdt.getMonthValue(), zdt.getDayOfMonth(),
                zdt.getHour(), zdt.getMinute(), zdt.getSecond(), micros);
    }

    /** RFC 3986 §6.2.2 syntax-based normalization; relative IRIs fail closed. */
    static String normIri(Object value) {
        if (!(value instanceof String s0)) {
            throw new CanonicalizationException("IRI must be a string: " + value);
        }
        String s = s0.trim();
        java.net.URI uri;
        try {
            uri = java.net.URI.create(s);
        } catch (IllegalArgumentException e) {
            throw new CanonicalizationException("unparseable IRI: " + s);
        }
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || scheme.isEmpty() || (host == null && uri.getAuthority() == null)) {
            throw new CanonicalizationException("relative IRI in canonical envelope: " + s);
        }
        String lowerScheme = scheme.toLowerCase(java.util.Locale.ROOT);
        String authority = uri.getRawAuthority() == null
                ? null : uri.getRawAuthority().toLowerCase(java.util.Locale.ROOT);
        // Strip default ports (http :80, https :443).
        if (authority != null && host != null) {
            String portSuffix = null;
            if ("http".equals(lowerScheme) && authority.endsWith(":80")) {
                portSuffix = ":80";
            } else if ("https".equals(lowerScheme) && authority.endsWith(":443")) {
                portSuffix = ":443";
            }
            if (portSuffix != null) {
                authority = authority.substring(0, authority.length() - portSuffix.length());
            }
        }
        String path = removeDotSegments(uri.getRawPath() == null ? "" : uri.getRawPath());
        StringBuilder out = new StringBuilder();
        out.append(lowerScheme).append("://");
        if (authority != null) {
            out.append(authority);
        }
        out.append(path);
        if (uri.getRawQuery() != null) {
            out.append('?').append(uri.getRawQuery());
        }
        if (uri.getRawFragment() != null) {
            out.append('#').append(uri.getRawFragment());
        }
        return out.toString();
    }

    private static String removeDotSegments(String path) {
        List<String> out = new ArrayList<>();
        for (String seg : path.split("/")) {
            if (seg.isEmpty() || seg.equals(".")) {
                continue;
            }
            if (seg.equals("..")) {
                if (!out.isEmpty()) {
                    out.remove(out.size() - 1);
                }
                continue;
            }
            out.add(seg);
        }
        return "/" + String.join("/", out);
    }

    /** Canonical decimal string: no leading zeros, no trailing fraction zeros, no exponent. */
    static String normDecimalString(Object value) {
        if (!(value instanceof String s0)) {
            throw new CanonicalizationException("decimal must be a string: " + value);
        }
        String s = s0.trim();
        if (!DECIMAL_RE.matcher(s).matches()) {
            throw new CanonicalizationException("non-canonical decimal: " + value);
        }
        boolean neg = s.startsWith("-");
        s = s.substring(1);
        if (s.contains(".")) {
            String[] parts = s.split("\\.", 2);
            String ip = parts[0];
            String fp = parts[1];
            ip = ip.replaceFirst("^0+", "");
            if (ip.isEmpty()) {
                ip = "0";
            }
            fp = fp.replaceFirst("0+$", "");
            s = fp.isEmpty() ? ip : ip + "." + fp;
        } else {
            s = s.replaceFirst("^0+", "");
            if (s.isEmpty()) {
                s = "0";
            }
        }
        if (neg && !s.equals("0")) {
            s = "-" + s;
        }
        return s;
    }

    /** Integral doubles collapse to Long (Python int parity); NaN/Infinity fail closed. */
    static Object normNumber(double d) {
        if (Double.isNaN(d) || Double.isInfinite(d)) {
            throw new CanonicalizationException("NaN/Infinity not allowed: " + d);
        }
        if (d == Math.rint(d) && !Double.isInfinite(d)
                && Math.abs(d) <= 9.007199254740992E15) {
            return (long) d;
        }
        return d;
    }

    /** NFC normalization, BOM strip, Cf (format) character removal. */
    static String normString(String value) {
        String s = Normalizer.normalize(value, Normalizer.Form.NFC);
        s = s.replace("\uFEFF", "");
        StringBuilder sb = new StringBuilder(s.length());
        s.codePoints().forEach(cp -> {
            int type = Character.getType(cp);
            if (type != Character.FORMAT) {
                sb.appendCodePoint(cp);
            }
        });
        return sb.toString();
    }
}
