use serde_json::Value;
use crate::error::VerifierError;

pub fn structural_parse(m: &mut Value) -> Result<(), VerifierError> {
    let obj = m.as_object().ok_or_else(|| {
        VerifierError::InvalidInput("root must be a JSON object".into())
    })?;

    let required = ["actor", "intent", "domain", "event_id"];
    for field in &required {
        if !obj.contains_key(*field) {
            return Err(VerifierError::InvalidInput(
                format!("missing required field {:?}", field),
            ));
        }
    }

    Ok(())
}

pub fn check_embedded_version(m: &Value, expected_version: u32) -> Result<(), VerifierError> {
    if let Some(obj) = m.as_object() {
        if let Some(v) = obj.get("ccnf_version") {
            if let Some(n) = v.as_f64() {
                if n as u32 != expected_version {
                    return Err(VerifierError::CcnfVersionMismatch(
                        format!("input declares ccnf_version {}, engine is {}", n as u32, expected_version),
                    ));
                }
            }
        }
    }
    Ok(())
}

pub fn check_target_id(m: &Value) -> Result<(), VerifierError> {
    let intent = m.as_object()
        .and_then(|o| o.get("intent"))
        .and_then(|v| v.as_object())
        .ok_or_else(|| VerifierError::InvalidInput("intent not found".into()))?;

    let target_id = intent.get("target_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if target_id.is_empty() {
        return Ok(());
    }

    if !is_valid_artifact_id(target_id) {
        return Err(VerifierError::ArtifactResolution(
            format!("target_id {:?} is not a valid type:id reference", target_id),
        ));
    }

    Ok(())
}

pub fn is_valid_artifact_id(id: &str) -> bool {
    let parts: Vec<&str> = id.split(':').collect();
    if parts.len() < 2 {
        return false;
    }
    parts.iter().all(|p| !p.is_empty())
}

fn get_string<'a>(obj: &'a serde_json::Map<String, Value>, key: &str) -> &'a str {
    obj.get(key).and_then(|v| v.as_str()).unwrap_or("")
}
