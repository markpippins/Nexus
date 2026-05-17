// Contract enforcement rules.
// These functions validate inputs against SERIALIZATION_CONTRACT.md rules.

use crate::error::VerifierError;

pub fn validate_key(key: &str) -> Result<(), VerifierError> {
    if key.is_empty() {
        return Err(VerifierError::InvalidInput("empty key".into()));
    }
    Ok(())
}

pub fn validate_float_repr(s: &str) -> Result<(), VerifierError> {
    if s.contains('e') || s.contains('E') {
        return Err(VerifierError::InvalidInput(
            format!("scientific notation rejected: {}", s),
        ));
    }
    Ok(())
}
