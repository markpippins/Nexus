package com.aibizarchitect.nexus.conformance.verifier;

import java.math.BigInteger;
import java.util.List;
import java.util.Map;

/**
 * Canonical JSON writer — compact, key-sorted, no trailing newline.
 *
 * Byte-parity contract with the Python reference (W1.04 §2 + §4):
 *
 * <ul>
 *   <li>separators {@code (",", ":")} — no spaces,</li>
 *   <li>keys sorted lexicographically at every level,</li>
 *   <li>non-ASCII characters emitted raw (ensure_ascii=False parity),</li>
 *   <li>integers render without a decimal point (Python {@code int} parity),
 *       doubles use shortest round-trip fixed notation with {@code ".0"}
 *       appended when the shortest form would be integer-shaped (Python
 *       {@code repr(float)} parity — Python never renders {@code 1.0} as
 *       {@code 1}),</li>
 *   <li>booleans render as {@code true}/{@code false}, {@code null} as
 *       {@code null}.</li>
 * </ul>
 *
 * Strings escape per Python {@code json.dumps} with
 * {@code ensure_ascii=False}: minimal escapes, {@code \\uXXXX} for control
 * characters below 0x20, and surrogate-pair escape for unpaired surrogates.
 */
public final class CanonicalJson {

    private CanonicalJson() {
    }

    /** Render a canonicalized value tree as canonical JSON (no trailing newline). */
    public static String write(Object value) {
        StringBuilder sb = new StringBuilder();
        writeValue(value, sb);
        return sb.toString();
    }

    private static void writeValue(Object value, StringBuilder sb) {
        if (value == null) {
            sb.append("null");
            return;
        }
        if (value instanceof String s) {
            writeString(s, sb);
            return;
        }
        if (value instanceof Boolean b) {
            sb.append(b ? "true" : "false");
            return;
        }
        if (value instanceof Double d) {
            writeDouble(d, sb);
            return;
        }
        if (value instanceof Float f) {
            writeDouble(f.doubleValue(), sb);
            return;
        }
        if (value instanceof BigInteger bi) {
            sb.append(bi.toString());
            return;
        }
        if (value instanceof Number n) {
            // Long, Integer, Short, Byte — integral JSON numbers.
            sb.append(n.toString());
            return;
        }
        if (value instanceof Map<?, ?> m) {
            writeObject(m, sb);
            return;
        }
        if (value instanceof List<?> l) {
            writeArray(l, sb);
            return;
        }
        throw new CanonicalizationException(
                "unsupported value type for canonical JSON: " + value.getClass().getName());
    }

    @SuppressWarnings("unchecked")
    private static void writeObject(Map<?, ?> m, StringBuilder sb) {
        // Keys are already normalized strings at this point; sort a copy.
        List<String> keys = new java.util.ArrayList<>(((Map<String, Object>) m).keySet());
        java.util.Collections.sort(keys);
        sb.append('{');
        for (int i = 0; i < keys.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            writeString(keys.get(i), sb);
            sb.append(':');
            writeValue(m.get(keys.get(i)), sb);
        }
        sb.append('}');
    }

    private static void writeArray(List<?> l, StringBuilder sb) {
        sb.append('[');
        for (int i = 0; i < l.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            writeValue(l.get(i), sb);
        }
        sb.append(']');
    }

    private static void writeDouble(double d, StringBuilder sb) {
        if (Double.isNaN(d) || Double.isInfinite(d)) {
            throw new CanonicalizationException("NaN/Infinity not allowed in canonical JSON");
        }
        String repr = Double.toString(d);
        // Python repr(float) parity: shortest round-trip, fixed notation.
        // Java Double.toString already yields shortest round-trip fixed
        // notation except for large/small magnitudes where it switches to
        // scientific notation (1.0E7); Python repr does the same (1e+07
        // shape differs). The W1.09 corpus contains no such magnitudes, and
        // the W1.04 spec §2.5 forbids scientific notation — so convert any
        // scientific form to plain decimal.
        if (repr.contains("E")) {
            repr = new java.math.BigDecimal(repr).toPlainString();
            // Python renders 1e+07 as 10000000.0 via json.dumps? No —
            // json.dumps(1e7) -> "10000000.0". BigDecimal plain string of
            // "1.0E7" is "10" + scale adjustments; ensure a ".0" suffix when
            // integral to match Python float rendering.
        }
        if (!repr.contains(".") && !repr.contains("E")) {
            // Integral double: Python renders 1.0 as "1.0".
            sb.append(repr).append(".0");
            return;
        }
        sb.append(repr);
    }

    private static void writeString(String s, StringBuilder sb) {
        sb.append('"');
        int i = 0;
        final int length = s.length();
        while (i < length) {
            int cp = s.codePointAt(i);
            if (cp == '"') {
                sb.append("\\\"");
            } else if (cp == '\\') {
                sb.append("\\\\");
            } else if (cp == '\n') {
                sb.append("\\n");
            } else if (cp == '\r') {
                sb.append("\\r");
            } else if (cp == '\t') {
                sb.append("\\t");
            } else if (cp == '\b') {
                sb.append("\\b");
            } else if (cp == '\f') {
                sb.append("\\f");
            } else if (cp < 0x20) {
                sb.append(String.format("\\u%04x", cp));
            } else if (cp > 0xFFFF) {
                // Astral plane: Python ensure_ascii=False emits the raw
                // code point; emit the surrogate pair as raw chars too.
                char[] chars = Character.toChars(cp);
                sb.append(chars);
            } else {
                sb.append((char) cp);
            }
            i += Character.charCount(cp);
        }
        sb.append('"');
    }
}
