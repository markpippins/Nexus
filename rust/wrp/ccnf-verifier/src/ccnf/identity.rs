use sha2::{Digest, Sha256};
use serde_json::Value;
use crate::canonical::encoder::encode_canonical;
use crate::contract::ordering::sort_keys;
use crate::error::VerifierError;

pub fn derive_identity(m: &Value) -> Result<(String, &'static str, String), VerifierError> {
    let obj = m.as_object().ok_or_else(|| {
        VerifierError::InvalidInput("root not an object".into())
    })?;

    let domain = obj.get("domain").and_then(|v| v.as_str()).unwrap_or("");
    let scope = domain_to_scope(domain);

    let intent = obj.get("intent").and_then(|v| v.as_object()).ok_or_else(|| {
        VerifierError::InvalidInput("no intent in identity derivation".into())
    })?;

    let action = intent.get("action").and_then(|v| v.as_str()).unwrap_or("");
    if action.is_empty() {
        return Err(VerifierError::InvalidInput("no action in intent".into()));
    }

    let mut fields = serde_json::Map::new();
    fields.insert("domain".into(), Value::String(domain.into()));
    fields.insert("intent".into(), Value::Object(intent.clone()));
    fields.insert("actor".into(), obj.get("actor").cloned().unwrap_or(Value::Null));
    fields.insert("scope".into(), Value::String(scope.clone()));

    let entity_key = hash_entity_signature(&Value::Object(fields))?;

    Ok((entity_key, "event", scope))
}

pub fn derive_collapse_key(m: &Value) -> Option<String> {
    let intent = m.as_object()
        .and_then(|o| o.get("intent"))
        .and_then(|v| v.as_object())?;

    let target_type = intent.get("target_type").and_then(|v| v.as_str())?;
    let target_id = intent.get("target_id").and_then(|v| v.as_str())?;

    if target_type.is_empty() || target_id.is_empty() {
        return None;
    }

    Some(format!("{}:{}", target_type, target_id))
}

pub fn derive_alias_keys(_m: &Value) -> Vec<String> {
    vec![]
}

fn hash_entity_signature(fields: &Value) -> Result<String, VerifierError> {
    let obj = fields.as_object().ok_or_else(|| {
        VerifierError::InvalidInput("fields must be an object".into())
    })?;

    let mut hasher = Sha256::new();
    let mut keys: Vec<String> = obj.keys().cloned().collect();
    sort_keys(&mut keys);

    for key in &keys {
        let val = obj.get(key).unwrap();
        let canonical = encode_canonical(val)?;
        hasher.update(key.as_bytes());
        hasher.update(&[0u8]);
        hasher.update(&canonical);
        hasher.update(&[0u8]);
    }

    Ok(hex::encode(hasher.finalize()))
}

fn domain_to_scope(domain: &str) -> String {
    match domain {
        "execution" => "executiongraph.v2".into(),
        "specification" => "specification.v1".into(),
        "system" => "system.v1".into(),
        _ => format!("{}.v1", domain),
    }
}
