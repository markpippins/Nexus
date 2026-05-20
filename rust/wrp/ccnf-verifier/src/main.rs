#![allow(dead_code)]

mod contract;
mod canonical;
mod ccnf;
mod vectors;
mod verifier;
mod ffi;
mod error;
mod runtime;
mod projection;

use std::path::Path;
use std::env;
use std::process;
use std::collections::HashMap;
use vectors::{load_vectors, extract_vector_inputs};

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: ccnf-verifier <vectors-dir>");
        process::exit(1);
    }

    let vectors_dir = Path::new(&args[1]);

    let vectors = match load_vectors(vectors_dir) {
        Ok(v) => v,
        Err(e) => { eprintln!("FATAL: {}", e); process::exit(1); }
    };

    // Load expected hashes into a flat map: "vector-name.canonical_hash[_suffix]" → hash
    let expected = match load_expected_hash_map(vectors_dir) {
        Ok(h) => h,
        Err(e) => { eprintln!("FATAL: {}", e); process::exit(1); }
    };

    println!("ccnf-verifier R8  —  independent CCNF pipeline verifier");
    println!("  vectors:       {}", vectors_dir.display());
    println!("  vectors found: {}", vectors.len());
    println!("  hashes loaded: {}", expected.len());
    println!();

    let mut passed = 0u32;
    let mut failed = 0u32;

    for v in &vectors {
        let obj = match v.input.as_object() {
            Some(o) => o,
            None => { continue; }
        };

        let has_error = obj.get("expected")
            .and_then(|e| e.as_object())
            .and_then(|e| e.get("error"))
            .is_some();

        let inputs = extract_vector_inputs(&v.input);
        if inputs.is_empty() { continue; }

        for (suffix, input_str) in &inputs {
            // Expected hash key in the hashes map:
            // canonical_hash → "vector-name.canonical_hash"
            // canonical_hash_a → "vector-name.canonical_hash_a"
            // canonical_hash_b → "vector-name.canonical_hash_b"
            let hash_key = format!("{}.canonical_hash{}", v.name, suffix);

            // Handle error expectations
            if has_error && suffix.is_empty() {
                let expected_err = obj.get("expected")
                    .and_then(|e| e.as_object())
                    .and_then(|e| e.get("error"))
                    .and_then(|e| e.as_str())
                    .unwrap_or("");

                match ccnf::run(input_str, 1) {
                    Ok(hash) => {
                        eprintln!("  FAIL {}: expected error {:?} but got hash {}", v.name, expected_err, &hash[..12]);
                        failed += 1;
                    }
                    Err(e) => {
                        let err_msg = e.to_string();
                        if err_msg.contains(expected_err) || expected_err.is_empty() {
                            passed += 1;
                        } else {
                            eprintln!("  FAIL {}: expected error {:?} but got {:?}", v.name, expected_err, err_msg);
                            failed += 1;
                        }
                    }
                }
                continue;
            }

            // Look up expected hash
            let expected_hash = match expected.get(&hash_key) {
                Some(h) => h,
                None => {
                    eprintln!("  SKIP {}: no expected hash for key {:?}", v.name, hash_key);
                    continue;
                }
            };

            // Run Rust CCNF pipeline
            let rust_hash = match ccnf::run(input_str, 1) {
                Ok(h) => h,
                Err(e) => {
                    eprintln!("  FAIL {}: rust CCNF error: {}", hash_key, e);
                    failed += 1;
                    continue;
                }
            };

            if rust_hash == *expected_hash {
                passed += 1;
            } else {
                eprintln!("  FAIL {}:", hash_key);
                eprintln!("         rust:      {}", rust_hash);
                eprintln!("         expected:  {}", expected_hash);
                failed += 1;
            }
        }
    }

    let total = passed + failed;
    println!();
    println!("  Summary:  {}/{} passed  ({} failed)", passed, total, failed);

    if failed > 0 {
        eprintln!();
        eprintln!("  R8: GATE FAILED — {} vectors failed verification", failed);
        process::exit(1);
    }

    println!();
    println!("  R8: GATE PASSED — CCNF pipeline verified against {} golden vectors", total);
}

fn load_expected_hash_map(dir: &Path) -> Result<HashMap<String, String>, error::VerifierError> {
    use std::fs;
    use serde_json::Value;

    let path = dir.join("expected-hashes.json");
    let content = fs::read_to_string(&path)
        .map_err(|e| error::VerifierError::Io(format!("reading {}: {}", path.display(), e)))?;
    let value: Value = serde_json::from_str(&content)
        .map_err(|e| error::VerifierError::JsonParse(format!("expected-hashes: {}", e)))?;

    let mut map = HashMap::new();
    let obj = match value.as_object() {
        Some(o) => o,
        None => return Ok(map),
    };

    // Structure is: {"filename.json": {"canonical_hash": "hash", ...}, ...}
    for (filename, entry) in obj {
        let entry_obj = match entry.as_object() {
            Some(o) => o,
            None => continue,
        };

        // Strip .json suffix from filename
        let name = filename.strip_suffix(".json").unwrap_or(filename);

        for (key, val) in entry_obj {
            if let Some(hash) = val.as_str() {
                if hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
                    let map_key = format!("{}.{}", name, key);
                    map.insert(map_key, hash.to_string());
                }
            }
        }
    }

    Ok(map)
}
