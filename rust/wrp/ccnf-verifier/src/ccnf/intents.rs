use std::collections::HashSet;
use std::sync::LazyLock;
use serde_json::Value;
use crate::error::VerifierError;

static CONTROLLED_VOCAB: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    ["create", "update", "delete", "execute", "validate", "emit"].into()
});

pub fn normalize_intent(m: &Value) -> Result<Value, VerifierError> {
    let raw_intent = m.as_object()
        .and_then(|o| o.get("intent"))
        .ok_or_else(|| VerifierError::IntentNormalization("no intent field".into()))?;

    match raw_intent {
        Value::String(s) => {
            return Err(VerifierError::IntentNormalization(
                format!("free-text intent {:?} cannot be mapped", s),
            ));
        }
        Value::Object(v) => {
            let action = v.get("action")
                .and_then(|a| a.as_str())
                .ok_or_else(|| VerifierError::IntentNormalization("empty action in intent".into()))?;

            if !CONTROLLED_VOCAB.contains(action) {
                return Err(VerifierError::IntentNormalization(
                    format!("unknown action {:?}", action),
                ));
            }

            let target_type = v.get("target_type").and_then(|t| t.as_str()).unwrap_or("");
            let target_id = v.get("target_id").and_then(|t| t.as_str()).unwrap_or("");

            Ok(serde_json::json!({
                "type": "normalized_verb",
                "action": action,
                "target_type": target_type,
                "target_id": target_id,
            }))
        }
        _ => Err(VerifierError::IntentNormalization(
            format!("unexpected intent type {}", raw_intent.as_str().unwrap_or("unknown")),
        )),
    }
}
