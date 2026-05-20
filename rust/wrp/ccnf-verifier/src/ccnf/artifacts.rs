use serde_json::Value;
use crate::error::VerifierError;
use crate::ccnf::parse::is_valid_artifact_id;

pub fn resolve_artifacts(m: &Value) -> Result<(Vec<String>, Vec<Value>), VerifierError> {
    let payload = m.as_object()
        .and_then(|o| o.get("payload"))
        .and_then(|v| v.as_object());

    let data = payload
        .and_then(|p| p.get("data"))
        .and_then(|v| v.as_object());

    let data = match data {
        Some(d) if !d.is_empty() => d,
        _ => return Ok((vec![], vec![])),
    };

    let mut refs = Vec::new();
    let mut artifact_values = Vec::new();

    for (k, v) in data {
        if !is_valid_artifact_id(k) {
            return Err(VerifierError::ArtifactResolution(
                format!("invalid artifact id {:?}", k),
            ));
        }

        let patch = v.as_object().ok_or_else(|| {
            VerifierError::ArtifactResolution(
                format!("artifact {:?} value must be an object", k),
            )
        })?;

        refs.push(k.clone());

        let mut entry = serde_json::Map::new();
        entry.insert("artifact_id".into(), Value::String(k.clone()));
        entry.insert("patch".into(), Value::Object(patch.clone()));
        artifact_values.push(Value::Object(entry));
    }

    refs.sort_by(|a, b| a.as_bytes().cmp(b.as_bytes()));
    artifact_values.sort_by(|a, b| {
        let a_id = a.as_object().and_then(|o| o.get("artifact_id")).and_then(|v| v.as_str()).unwrap_or("");
        let b_id = b.as_object().and_then(|o| o.get("artifact_id")).and_then(|v| v.as_str()).unwrap_or("");
        a_id.as_bytes().cmp(b_id.as_bytes())
    });

    Ok((refs, artifact_values))
}
