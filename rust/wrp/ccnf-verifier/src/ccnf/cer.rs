// BuildCERMap and ComputeHash — serialization + hashing of CER.

use serde_json::Value;
use crate::canonical::encoder::encode_canonical;
use crate::contract::hashing::sha256_hex;
use crate::error::VerifierError;
use crate::ccnf::build::Cer;

pub fn build_cer_map(cer: &Cer) -> Value {
    let mut m = serde_json::Map::new();

    m.insert("event_id".into(), Value::String(cer.event_id.clone()));
    m.insert("event_version".into(), Value::Number(cer.event_version.into()));
    m.insert("ccnf_version".into(), Value::Number(cer.ccnf_version.into()));
    m.insert("system".into(), Value::String(cer.system.clone()));
    m.insert("domain".into(), Value::String(cer.domain.clone()));
    m.insert("timestamp".into(), Value::Number(cer.timestamp.into()));
    m.insert("actor".into(), cer.actor.clone());
    m.insert("intent".into(), cer.intent.clone());

    let mut identity = serde_json::Map::new();
    identity.insert("entity_key".into(), Value::String(cer.entity_key.clone()));
    identity.insert("type".into(), Value::String(cer.identity_type.clone()));
    identity.insert("scope".into(), Value::String(cer.scope.clone()));
    // collapse_key and alias_keys: Go canonical serializer has a type handling
    // limitation where *string and []string serialize as null.
    // Match this for golden vector compatibility.
    identity.insert("collapse_key".into(), Value::Null);
    identity.insert("alias_keys".into(), Value::Null);
    m.insert("identity".into(), Value::Object(identity));

    m.insert("causality".into(), cer.causality.clone());

    // artifact_refs: Go canonical serializer has a type handling limitation
    // where []string serializes as null instead of []. Match this for
    // golden vector compatibility.
    m.insert("artifact_refs".into(), Value::Null);

    // state_delta: same type handling limitation
    m.insert("state_delta".into(), Value::Null);

    m.insert("payload".into(), cer.payload.clone());
    m.insert("compression".into(), cer.compression.clone());

    // Signature is inserted separately — excluded from hash
    let mut sig = serde_json::Map::new();
    sig.insert("hash".into(), Value::String("placeholder".into()));
    sig.insert("signed_by".into(), Value::Null);
    m.insert("signature".into(), Value::Object(sig));

    Value::Object(m)
}

pub fn compute_hash(cer: &Cer) -> Result<String, VerifierError> {
    let m = build_cer_map(cer);

    // Remove signature for hash computation
    let mut obj = m.as_object().cloned().unwrap_or_default();
    obj.remove("signature");

    let value = Value::Object(obj);
    let bytes = encode_canonical(&value)?;
    Ok(sha256_hex(&bytes))
}
