mod parse;
mod canon;
mod intents;
mod artifacts;
mod identity;
mod deltas;
mod build;
mod cer;

use serde_json::Value;
use crate::error::VerifierError;


pub fn run(pipeline_input: &str, ccnf_version: u32) -> Result<String, VerifierError> {
    if ccnf_version != 1 {
        return Err(VerifierError::InvalidInput(
            format!("expected ccnf_version 1, got {}", ccnf_version),
        ));
    }

    let mut m: Value = serde_json::from_str(pipeline_input)
        .map_err(|e| VerifierError::JsonParse(e.to_string()))?;

    parse::structural_parse(&mut m)?;
    parse::check_embedded_version(&m, ccnf_version)?;

    m = canon::canonicalize_fields(m);

    let normalized_intent = intents::normalize_intent(&m)?;
    if let Some(obj) = m.as_object_mut() {
        obj.insert("intent".into(), normalized_intent);
    }

    parse::check_target_id(&m)?;

    let (artifact_refs, artifacts) = artifacts::resolve_artifacts(&m)?;

    let (entity_key, identity_type, scope) = identity::derive_identity(&m)?;
    let collapse_key = identity::derive_collapse_key(&m);
    let alias_keys = identity::derive_alias_keys(&m);

    let state_deltas = deltas::compute_state_deltas(&m, &artifact_refs, &artifacts)?;

    let cer = build::build_cer(
        &m, ccnf_version, &entity_key, identity_type, &scope,
        collapse_key, alias_keys,
        &artifact_refs, &state_deltas,
    );

    let hash = cer::compute_hash(&cer)?;
    Ok(hash)
}
