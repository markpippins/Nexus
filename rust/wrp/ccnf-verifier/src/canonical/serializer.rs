// spec-faithful canonical JSON serializer.
// Zero serde dependency on the output path. Hand-writes canonical JSON bytes.
// Implements all 9 rules from SERIALIZATION_CONTRACT.md verbatim.

use serde_json::Value;
use crate::contract::ordering::sort_keys;
use crate::contract::normalization::normalize_string;
use crate::error::VerifierError;

#[derive(Debug, Clone)]
pub struct CanonicalBytes {
    pub bytes: Vec<u8>,
}

/// Canonicalize a parsed JSON value into canonical bytes.
pub fn canonicalize(value: &Value) -> Result<CanonicalBytes, VerifierError> {
    let mut buf = Vec::new();
    write_canonical(value, &mut buf)?;
    Ok(CanonicalBytes { bytes: buf })
}

fn write_canonical(value: &Value, buf: &mut Vec<u8>) -> Result<(), VerifierError> {
    match value {
        Value::Null => {
            buf.extend_from_slice(b"null");
        }
        Value::Bool(b) => {
            buf.extend_from_slice(if *b { b"true" } else { b"false" });
        }
        Value::Number(n) => {
            // Rules 3-4: integers as direct string, floats without scientific notation
            if let Some(i) = n.as_i64() {
                buf.extend_from_slice(i.to_string().as_bytes());
            } else if let Some(f) = n.as_f64() {
                if f.is_nan() || f.is_infinite() {
                    buf.extend_from_slice(b"null");
                } else {
                    // Rule 4: normalize 3.0 -> 3, reject scientific notation
                    let s = format!("{:.}", f);
                    if !s.contains('.') {
                        buf.extend_from_slice(s.as_bytes());
                    } else {
                        // Trim trailing zeros but keep at least one decimal
                        let trimmed = trim_trailing_zeros(&s);
                        buf.extend_from_slice(trimmed.as_bytes());
                    }
                }
            } else {
                // Fallback: emit as string repr
                let s = n.to_string();
                if s.contains('e') || s.contains('E') {
                    return Err(VerifierError::InvalidInput(
                        format!("scientific notation rejected: {}", s),
                    ));
                }
                buf.extend_from_slice(s.as_bytes());
            }
        }
        Value::String(s) => {
            // Rule 5-6: NFC normalize, strip BOM/zero-width, preserve case
            let normalized = normalize_string(s);
            write_json_string(&normalized, buf);
        }
        Value::Array(arr) => {
            buf.push(b'[');
            for (i, item) in arr.iter().enumerate() {
                if i > 0 {
                    buf.push(b',');
                }
                write_canonical(item, buf)?;
            }
            buf.push(b']');
        }
        Value::Object(map) => {
            buf.push(b'{');
            // Rule 1: collect keys, sort bytewise UTF-8
            let mut keys: Vec<String> = map.keys().cloned().collect();
            sort_keys(&mut keys);
            for (i, key) in keys.iter().enumerate() {
                if i > 0 {
                    buf.push(b',');
                }
                write_json_string(key, buf);
                buf.push(b':');
                let val = map.get(key).unwrap();
                write_canonical(val, buf)?;
            }
            buf.push(b'}');
        }
    }
    Ok(())
}

// -- string emission (Rule 2: no spaces, no newlines, strict JSON escaping)

fn write_json_string(s: &str, buf: &mut Vec<u8>) {
    buf.push(b'"');
    for c in s.chars() {
        match c {
            '"' => buf.extend_from_slice(b"\\\""),
            '\\' => buf.extend_from_slice(b"\\\\"),
            '\x08' => buf.extend_from_slice(b"\\b"),
            '\x0c' => buf.extend_from_slice(b"\\f"),
            '\n' => buf.extend_from_slice(b"\\n"),
            '\r' => buf.extend_from_slice(b"\\r"),
            '\t' => buf.extend_from_slice(b"\\t"),
            c if (c as u32) < 0x20 => {
                buf.extend_from_slice(format!("\\u{:04x}", c as u32).as_bytes());
            }
            c => {
                let mut encoded = [0u8; 4];
                let s = c.encode_utf8(&mut encoded);
                buf.extend_from_slice(s.as_bytes());
            }
        }
    }
    buf.push(b'"');
}

fn trim_trailing_zeros(s: &str) -> String {
    if !s.contains('.') {
        return s.to_string();
    }
    let trimmed = s.trim_end_matches('0');
    if trimmed.ends_with('.') {
        format!("{}", trimmed.trim_end_matches('.'))
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn null_value() {
        let v = json!(null);
        let c = canonicalize(&v).unwrap();
        assert_eq!(c.bytes, b"null");
    }

    #[test]
    fn bool_true() {
        let v = json!(true);
        let c = canonicalize(&v).unwrap();
        assert_eq!(c.bytes, b"true");
    }

    #[test]
    fn integer() {
        let v = json!(42);
        let c = canonicalize(&v).unwrap();
        assert_eq!(c.bytes, b"42");
    }

    #[test]
    fn float_trim() {
        let v = json!(3.0);
        let c = canonicalize(&v).unwrap();
        assert_eq!(c.bytes, b"3");
    }

    #[test]
    fn float_non_integer() {
        let v = json!(3.14);
        let c = canonicalize(&v).unwrap();
        assert_eq!(c.bytes, b"3.14");
    }

    #[test]
    fn string_escaped() {
        let v = json!("hello\nworld");
        let c = canonicalize(&v).unwrap();
        assert_eq!(c.bytes, b"\"hello\\nworld\"");
    }

    #[test]
    fn empty_object() {
        let v = json!({});
        let c = canonicalize(&v).unwrap();
        assert_eq!(c.bytes, b"{}");
    }

    #[test]
    fn sorted_keys() {
        let v = json!({"z": 1, "a": 2, "m": 3});
        let c = canonicalize(&v).unwrap();
        assert_eq!(c.bytes, br#"{"a":2,"m":3,"z":1}"#);
    }

    #[test]
    fn array() {
        let v = json!([3, 1, 2]);
        let c = canonicalize(&v).unwrap();
        assert_eq!(c.bytes, b"[3,1,2]");
    }

    #[test]
    fn nested_object() {
        let v = json!({"b": {"y": 1, "x": 2}, "a": 3});
        let c = canonicalize(&v).unwrap();
        assert_eq!(c.bytes, br#"{"a":3,"b":{"x":2,"y":1}}"#);
    }

    #[test]
    fn string_sorts_bytewise() {
        // U+0042 'B' < U+0061 'a' in bytewise
        let v = json!({"a": 1, "B": 2});
        let c = canonicalize(&v).unwrap();
        assert_eq!(c.bytes, br#"{"B":2,"a":1}"#);
    }
}
