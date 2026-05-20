use sha2::{Digest, Sha256};
use serde_json::Value;
use crate::canonical::encoder::encode_canonical;
use crate::error::VerifierError;

pub fn compute_state_deltas(
    _m: &Value,
    artifact_refs: &[String],
    artifacts: &[Value],
) -> Result<Vec<Value>, VerifierError> {
    let mut deltas = Vec::new();

    for (i, ref_) in artifact_refs.iter().enumerate() {
        if i >= artifacts.len() {
            break;
        }

        let artifact = &artifacts[i];
        let patch = artifact.as_object()
            .and_then(|o| o.get("patch"))
            .and_then(|v| v.as_object())
            .ok_or_else(|| VerifierError::InvalidInput("missing patch".into()))?;

        let _before_hash: Option<String> = None;
        let after_hash = compute_patch_hash(&Value::Object(patch.clone()))?;

        let mut delta = serde_json::Map::new();
        delta.insert("artifact_id".into(), Value::String(ref_.clone()));
        delta.insert("before_hash".into(), Value::Null);
        delta.insert("after_hash".into(), Value::String(after_hash));
        delta.insert("patch".into(), Value::Object(patch.clone()));

        deltas.push(Value::Object(delta));
    }

    Ok(deltas)
}

fn compute_patch_hash(patch: &Value) -> Result<String, VerifierError> {
    let canonical = encode_canonical(patch)?;
    let mut hasher = Sha256::new();
    hasher.update(&canonical);
    Ok(hex::encode(hasher.finalize()))
}
