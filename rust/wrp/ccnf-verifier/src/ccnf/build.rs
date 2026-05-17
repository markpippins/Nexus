use serde_json::Value;

#[derive(Debug)]
pub struct Cer {
    pub event_id: String,
    pub event_version: u32,
    pub ccnf_version: u32,
    pub system: String,
    pub domain: String,
    pub timestamp: i64,
    pub actor: Value,
    pub intent: Value,
    pub entity_key: String,
    pub identity_type: String,
    pub scope: String,
    pub collapse_key: Option<String>,
    pub alias_keys: Vec<String>,
    pub causality: Value,
    pub artifact_refs: Vec<String>,
    pub state_delta: Vec<Value>,
    pub payload: Value,
    pub compression: Value,
}

pub fn build_cer(
    m: &Value,
    ccnf_version: u32,
    entity_key: &str,
    identity_type: &str,
    scope: &str,
    collapse_key: Option<String>,
    alias_keys: Vec<String>,
    artifact_refs: &[String],
    state_delta: &[Value],
) -> Cer {
    let obj = m.as_object().unwrap();
    let domain = get_str(obj, "domain");
    let event_id = get_str(obj, "event_id");
    let actor = obj.get("actor").cloned().unwrap_or(Value::Null);
    let intent = obj.get("intent").cloned().unwrap_or(Value::Null);
    let timestamp = obj.get("timestamp")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    let causality = build_causality(obj);
    let payload = build_payload(obj);

    let compression = serde_json::json!({
        "strategy": "full",
        "lossless": true,
        "compression_version": 1,
    });

    Cer {
        event_id,
        event_version: 1,
        ccnf_version,
        system: "nexus".into(),
        domain,
        timestamp,
        actor,
        intent,
        entity_key: entity_key.into(),
        identity_type: identity_type.into(),
        scope: scope.into(),
        collapse_key,
        alias_keys,
        causality,
        artifact_refs: artifact_refs.to_vec(),
        state_delta: state_delta.to_vec(),
        payload,
        compression,
    }
}

fn build_causality(obj: &serde_json::Map<String, Value>) -> Value {
    let raw = obj.get("causality").and_then(|v| v.as_object());

    let mut c = serde_json::Map::new();
    if let Some(raw_c) = raw {
        c.insert("causal_chain_id".into(), raw_c.get("causal_chain_id").cloned().unwrap_or(Value::String("".into())));
        c.insert("parent_event_ids".into(), raw_c.get("parent_event_ids").cloned().unwrap_or(Value::Array(vec![])));
        c.insert("trace_depth".into(), raw_c.get("trace_depth").cloned().unwrap_or(Value::Number(0.into())));
        c.insert("ordered".into(), raw_c.get("ordered").cloned().unwrap_or(Value::Bool(true)));
    } else {
        c.insert("causal_chain_id".into(), Value::String("".into()));
        c.insert("parent_event_ids".into(), Value::Array(vec![]));
        c.insert("trace_depth".into(), Value::Number(0.into()));
        c.insert("ordered".into(), Value::Bool(true));
    }
    Value::Object(c)
}

fn build_payload(obj: &serde_json::Map<String, Value>) -> Value {
    let raw_payload = obj.get("payload").and_then(|v| v.as_object());
    let data = raw_payload
        .and_then(|p| p.get("data"))
        .and_then(|v| v.as_object());

    let filtered_data = match data {
        Some(d) => {
            let mut filtered = serde_json::Map::new();
            for (k, v) in d {
                if k.find(':').is_none() {
                    filtered.insert(k.clone(), v.clone());
                }
            }
            Value::Object(filtered)
        }
        None => Value::Object(serde_json::Map::new()),
    };

    serde_json::json!({
        "type": "structured",
        "data": filtered_data,
    })
}

fn get_str(obj: &serde_json::Map<String, Value>, key: &str) -> String {
    obj.get(key).and_then(|v| v.as_str()).unwrap_or("").to_string()
}
