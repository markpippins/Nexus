use crate::canonical::encoder::encode_canonical;
use crate::contract::hashing::sha256_hex;
use crate::error::VerifierError;
use serde_json::Value;

#[derive(Debug)]
pub struct ComparisonResult {
    pub vector_name: String,
    pub rust_hash: String,
    pub go_hash: String,
    pub expected_hash: String,
    pub hashes_match: bool,
    pub go_matches_expected: bool,
}

pub fn compute_hash_from_cer(cer_value: &Value) -> Result<String, VerifierError> {
    let mut map = match cer_value.as_object() {
        Some(m) => m.clone(),
        None => return Err(VerifierError::InvalidInput("expected.cer is not an object".into())),
    };
    map.remove("signature");
    let value = Value::Object(map);
    let bytes = encode_canonical(&value)?;
    Ok(sha256_hex(&bytes))
}

pub fn compare_triple(
    vector_name: &str,
    rust_hash: &str,
    go_hash: &str,
    expected_hash: &str,
) -> ComparisonResult {
    let hashes_match = rust_hash == expected_hash;
    let go_matches_expected = go_hash == expected_hash;
    ComparisonResult {
        vector_name: vector_name.to_string(),
        rust_hash: rust_hash.to_string(),
        go_hash: go_hash.to_string(),
        expected_hash: expected_hash.to_string(),
        hashes_match,
        go_matches_expected,
    }
}

pub fn cer_equal(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Null, Value::Null) => true,
        (Value::Bool(a), Value::Bool(b)) => a == b,
        (Value::Number(a), Value::Number(b)) => a == b,
        (Value::String(a), Value::String(b)) => a == b,
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() {
                return false;
            }
            a.iter().zip(b.iter()).all(|(x, y)| cer_equal(x, y))
        }
        (Value::Object(a), Value::Object(b)) => {
            if a.len() != b.len() {
                return false;
            }
            a.iter().all(|(k, v)| b.get(k).map_or(false, |bv| cer_equal(v, bv)))
        }
        _ => false,
    }
}
