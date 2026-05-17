use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use crate::error::VerifierError;

#[derive(Debug, Clone)]
pub struct VectorEntry {
    pub name: String,
    pub path: PathBuf,
    pub input: Value,
}

#[derive(Debug, Clone)]
pub struct ExpectedHash {
    pub name: String,
    pub hash: String,
}

/// Extract input fields from a golden vector.
/// Returns a list of (suffix, json_string) pairs.
/// suffix is "" for "input", "_a" for "input_a", "_b" for "input_b".
pub fn extract_vector_inputs(root: &Value) -> Vec<(String, String)> {
    let mut result = Vec::new();

    if let Some(input) = root.as_object().and_then(|o| o.get("input")) {
        if let Ok(s) = serde_json::to_string(input) {
            result.push(("".into(), s));
        }
    }
    if let Some(input) = root.as_object().and_then(|o| o.get("input_a")) {
        if let Ok(s) = serde_json::to_string(input) {
            result.push(("_a".into(), s));
        }
    }
    if let Some(input) = root.as_object().and_then(|o| o.get("input_b")) {
        if let Ok(s) = serde_json::to_string(input) {
            result.push(("_b".into(), s));
        }
    }

    result
}

pub fn load_vectors(dir: &Path) -> Result<Vec<VectorEntry>, VerifierError> {
    let mut vectors = Vec::new();
    let mut entries: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| VerifierError::Io(format!("reading {}: {}", dir.display(), e)))?
        .filter_map(|r| r.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map_or(false, |ext| ext == "json"))
        .collect();
    entries.sort();

    for path in entries {
        let name = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();
        if name == "expected-hashes" || name.starts_with('.') {
            continue;
        }
        let content = fs::read_to_string(&path)
            .map_err(|e| VerifierError::Io(format!("reading {}: {}", path.display(), e)))?;
        let value: Value = serde_json::from_str(&content)
            .map_err(|e| VerifierError::JsonParse(format!("{}: {}", path.display(), e)))?;
        vectors.push(VectorEntry { name, path, input: value });
    }
    Ok(vectors)
}

pub fn load_expected_hashes(dir: &Path) -> Result<Vec<ExpectedHash>, VerifierError> {
    let path = dir.join("expected-hashes.json");
    let content = fs::read_to_string(&path)
        .map_err(|e| VerifierError::Io(format!("reading {}: {}", path.display(), e)))?;
    let value: Value = serde_json::from_str(&content)
        .map_err(|e| VerifierError::JsonParse(format!("expected-hashes: {}", e)))?;
    let mut hashes = Vec::new();

    fn extract(obj: &serde_json::Map<String, Value>, name_prefix: &str, hashes: &mut Vec<ExpectedHash>) {
        for (key, val) in obj {
            let full_name = if name_prefix.is_empty() {
                key.clone()
            } else {
                format!("{}.{}", name_prefix, key)
            };

            match val {
                Value::String(s) => {
                    if s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit()) {
                        hashes.push(ExpectedHash { name: full_name, hash: s.clone() });
                    }
                }
                Value::Object(nested) => extract(nested, &full_name, hashes),
                _ => {}
            }
        }
    }

    if let Some(obj) = value.as_object() {
        extract(obj, "", &mut hashes);
    }

    // Filter to only canonical_hash entries
    hashes.retain(|h| {
        h.name.contains("canonical_hash")
    });

    // Additional: handle direct filename->hash mappings
    // (already captured by canonical_hash entries above)

    Ok(hashes)
}

/// Load raw expected hashes preserving the original key->hash map.
pub fn load_expected_hash_map(dir: &Path) -> Result<std::collections::HashMap<String, String>, VerifierError> {
    let path = dir.join("expected-hashes.json");
    let content = fs::read_to_string(&path)
        .map_err(|e| VerifierError::Io(format!("reading {}: {}", path.display(), e)))?;
    let value: Value = serde_json::from_str(&content)
        .map_err(|e| VerifierError::JsonParse(format!("expected-hashes: {}", e)))?;
    let mut map = std::collections::HashMap::new();

    fn extract(obj: &serde_json::Map<String, Value>, prefix: &str, map: &mut std::collections::HashMap<String, String>) {
        for (key, val) in obj {
            let full = if prefix.is_empty() { key.clone() } else { format!("{}.{}", prefix, key) };
            match val {
                Value::String(s) => { map.insert(full, s.clone()); }
                Value::Object(nested) => extract(nested, &full, map),
                _ => {}
            }
        }
    }

    if let Some(obj) = value.as_object() {
        extract(obj, "", &mut map);
    }

    Ok(map)
}
