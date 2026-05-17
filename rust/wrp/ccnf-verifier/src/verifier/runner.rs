use serde_json::Value;
use crate::vectors::{VectorEntry, ExpectedHash};
use crate::verifier::compare::{compute_hash_from_cer, compare_triple, ComparisonResult};
use crate::ffi::go_oracle;

#[derive(Debug)]
pub struct VerifierSummary {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub results: Vec<ComparisonResult>,
}

pub fn verify_vectors(
    vectors: &[VectorEntry],
    expected_hashes: &[ExpectedHash],
    go_binary: &str,
) -> VerifierSummary {
    let mut results = Vec::new();
    let mut passed = 0;
    let mut failed = 0;

    let hash_map: std::collections::HashMap<String, &str> = expected_hashes
        .iter()
        .map(|e| (e.name.clone(), e.hash.as_str()))
        .collect();

    for vector in vectors {
        let expected_hash = match hash_map.get(&vector.name) {
            Some(h) => h,
            None => {
                eprintln!("  WARN: no expected hash for {}", vector.name);
                continue;
            }
        };

        // Extract expected.cer from the vector
        let cer_value = match extract_cer(&vector.input) {
            Some(v) => v,
            None => {
                eprintln!("  FAIL {}: no expected.cer in vector", vector.name);
                failed += 1;
                results.push(ComparisonResult {
                    vector_name: vector.name.clone(),
                    rust_hash: "NO_CER".into(),
                    go_hash: "NO_CER".into(),
                    expected_hash: expected_hash.to_string(),
                    hashes_match: false,
                    go_matches_expected: false,
                });
                continue;
            }
        };

        // (A) Rust canonicalization of expected.cer
        let rust_hash = match compute_hash_from_cer(&cer_value) {
            Ok(h) => h,
            Err(e) => {
                eprintln!("  FAIL {}: rust canonicalization error: {}", vector.name, e);
                failed += 1;
                results.push(ComparisonResult {
                    vector_name: vector.name.clone(),
                    rust_hash: format!("ERROR: {}", e),
                    go_hash: "SKIPPED".into(),
                    expected_hash: expected_hash.to_string(),
                    hashes_match: false,
                    go_matches_expected: false,
                });
                continue;
            }
        };

        // (B) Go oracle
        let go_hash = match go_oracle::run_oracle(go_binary, &vector.path) {
            Ok(h) => h,
            Err(e) => {
                eprintln!("  WARN {}: go oracle error: {} (continuing with expected only)", vector.name, e);
                let result = compare_triple(&vector.name, &rust_hash, "ORACLE_ERROR", expected_hash);
                if result.hashes_match {
                    passed += 1;
                } else {
                    failed += 1;
                }
                results.push(result);
                continue;
            }
        };

        let result = compare_triple(&vector.name, &rust_hash, &go_hash, expected_hash);
        if result.hashes_match && result.go_matches_expected {
            passed += 1;
        } else {
            failed += 1;
        }
        results.push(result);
    }

    VerifierSummary { total: vectors.len(), passed, failed, results }
}

fn extract_cer(root: &Value) -> Option<Value> {
    let obj = root.as_object()?;
    let expected = obj.get("expected")?.as_object()?;
    expected.get("cer").cloned()
}
