// Strict JSON emission utilities.
// Wraps the canonical serializer for public consumption.

use crate::canonical::serializer::canonicalize;
use crate::error::VerifierError;
use serde_json::Value;

/// Canonical JSON encoder — the only public entry point for producing
/// canonical bytes from a parsed JSON value.
pub fn encode_canonical(value: &Value) -> Result<Vec<u8>, VerifierError> {
    let c = canonicalize(value)?;
    Ok(c.bytes)
}

/// Encode a JSON string directly into canonical bytes.
pub fn encode_canonical_str(json_str: &str) -> Result<Vec<u8>, VerifierError> {
    let value: Value = serde_json::from_str(json_str)
        .map_err(|e| VerifierError::JsonParse(e.to_string()))?;
    encode_canonical(&value)
}
