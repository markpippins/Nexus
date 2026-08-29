package com.aibizarchitect.nexus.conformance.verifier;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Minimal, strict JSON parser (RFC 8259) with zero third-party dependencies.
 *
 * Independent re-implementation for the W2.04 verifier: shares no code with
 * the Python reference (which uses {@code json.loads}). Semantics that matter
 * for conformance:
 *
 * <ul>
 *   <li>objects decode to insertion-ordered maps (Python dict parity),</li>
 *   <li>integral numbers decode to {@code Long} (Python {@code int} parity),
 *       non-integral to {@code Double} (Python {@code float} parity, shortest
 *       round-trip rendering via {@link Double#toString}),</li>
 *   <li>duplicate object keys are invalid — fail closed (W1.04 §3.2),</li>
 *   <li>unescaped control characters inside strings are invalid.</li>
 * </ul>
 */
public final class JsonParser {

    private final String src;
    private int pos;

    private JsonParser(String src) {
        this.src = src;
    }

    /** Parse a complete JSON document; throws {@link CanonicalizationException} on any defect. */
    public static Object parse(String text) {
        JsonParser parser = new JsonParser(text);
        parser.skipWs();
        Object value = parser.parseValue();
        parser.skipWs();
        if (parser.pos != parser.src.length()) {
            throw parser.error("trailing characters after JSON value");
        }
        return value;
    }

    private Object parseValue() {
        if (pos >= src.length()) {
            throw error("unexpected end of input");
        }
        char c = src.charAt(pos);
        switch (c) {
            case '{':
                return parseObject();
            case '[':
                return parseArray();
            case '"':
                return parseString();
            case 't':
                expect("true");
                return Boolean.TRUE;
            case 'f':
                expect("false");
                return Boolean.FALSE;
            case 'n':
                expect("null");
                return null;
            default:
                if (c == '-' || isAsciiDigit(c)) {
                    return parseNumber();
                }
                throw error("unexpected character '" + c + "'");
        }
    }

    private Map<String, Object> parseObject() {
        Map<String, Object> out = new LinkedHashMap<>();
        pos++; // consume '{'
        skipWs();
        if (peek() == '}') {
            pos++;
            return out;
        }
        while (true) {
            skipWs();
            if (peek() != '"') {
                throw error("expected string object key");
            }
            String key = parseString();
            skipWs();
            if (peek() != ':') {
                throw error("expected ':' after object key");
            }
            pos++;
            skipWs();
            Object value = parseValue();
            if (out.containsKey(key)) {
                // W1.04 §3.2: duplicate keys refuse (fail closed).
                throw error("duplicate object key: " + key);
            }
            out.put(key, value);
            skipWs();
            char c = peek();
            if (c == ',') {
                pos++;
                continue;
            }
            if (c == '}') {
                pos++;
                return out;
            }
            throw error("expected ',' or '}' in object");
        }
    }

    private List<Object> parseArray() {
        List<Object> out = new ArrayList<>();
        pos++; // consume '['
        skipWs();
        if (peek() == ']') {
            pos++;
            return out;
        }
        while (true) {
            skipWs();
            out.add(parseValue());
            skipWs();
            char c = peek();
            if (c == ',') {
                pos++;
                continue;
            }
            if (c == ']') {
                pos++;
                return out;
            }
            throw error("expected ',' or ']' in array");
        }
    }

    private String parseString() {
        pos++; // consume opening quote
        StringBuilder sb = new StringBuilder();
        while (true) {
            if (pos >= src.length()) {
                throw error("unterminated string");
            }
            char c = src.charAt(pos);
            if (c == '"') {
                pos++;
                return sb.toString();
            }
            if (c == '\\') {
                pos++;
                if (pos >= src.length()) {
                    throw error("unterminated escape sequence");
                }
                char esc = src.charAt(pos);
                switch (esc) {
                    case '"':
                        sb.append('"');
                        break;
                    case '\\':
                        sb.append('\\');
                        break;
                    case '/':
                        sb.append('/');
                        break;
                    case 'b':
                        sb.append('\b');
                        break;
                    case 'f':
                        sb.append('\f');
                        break;
                    case 'n':
                        sb.append('\n');
                        break;
                    case 'r':
                        sb.append('\r');
                        break;
                    case 't':
                        sb.append('\t');
                        break;
                    case 'u':
                        if (pos + 4 >= src.length()) {
                            throw error("truncated unicode escape");
                        }
                        String hex = src.substring(pos + 1, pos + 5);
                        try {
                            sb.append((char) Integer.parseInt(hex, 16));
                        } catch (NumberFormatException e) {
                            throw error("invalid unicode escape \\u" + hex);
                        }
                        pos += 4;
                        break;
                    default:
                        throw error("invalid escape '\\" + esc + "'");
                }
                pos++;
            } else if (c < 0x20) {
                throw error("unescaped control character in string");
            } else {
                sb.append(c);
                pos++;
            }
        }
    }

    private Object parseNumber() {
        int start = pos;
        if (peek() == '-') {
            pos++;
        }
        char c = peek();
        if (c == '0') {
            pos++;
        } else if (isAsciiDigit(c)) {
            while (pos < src.length() && isAsciiDigit(src.charAt(pos))) {
                pos++;
            }
        } else {
            throw error("invalid number");
        }
        boolean isFloat = false;
        if (pos < src.length() && src.charAt(pos) == '.') {
            isFloat = true;
            pos++;
            if (pos >= src.length() || !isAsciiDigit(src.charAt(pos))) {
                throw error("invalid number fraction");
            }
            while (pos < src.length() && isAsciiDigit(src.charAt(pos))) {
                pos++;
            }
        }
        if (pos < src.length() && (src.charAt(pos) == 'e' || src.charAt(pos) == 'E')) {
            isFloat = true;
            pos++;
            if (pos < src.length() && (src.charAt(pos) == '+' || src.charAt(pos) == '-')) {
                pos++;
            }
            if (pos >= src.length() || !isAsciiDigit(src.charAt(pos))) {
                throw error("invalid number exponent");
            }
            while (pos < src.length() && isAsciiDigit(src.charAt(pos))) {
                pos++;
            }
        }
        String token = src.substring(start, pos);
        if (isFloat) {
            return Double.parseDouble(token);
        }
        try {
            return Long.parseLong(token);
        } catch (NumberFormatException e) {
            return new java.math.BigInteger(token);
        }
    }

    private char peek() {
        if (pos >= src.length()) {
            throw error("unexpected end of input");
        }
        return src.charAt(pos);
    }

    private void expect(String word) {
        if (!src.startsWith(word, pos)) {
            throw error("invalid literal");
        }
        pos += word.length();
    }

    private void skipWs() {
        while (pos < src.length()) {
            char c = src.charAt(pos);
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                pos++;
            } else {
                return;
            }
        }
    }

    private static boolean isAsciiDigit(char c) {
        return c >= '0' && c <= '9';
    }

    private CanonicalizationException error(String message) {
        return new CanonicalizationException("JSON parse error at offset " + pos + ": " + message);
    }
}
