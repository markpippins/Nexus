// Go oracle integration: shell-out to ccnf-conformance binary.
// Treated as external executable, untrusted, reference oracle only.

use std::path::Path;
use std::process::Command;
use crate::error::VerifierError;

/// Run the Go oracle on a single vector file and return the canonical hash.
pub fn run_oracle(go_binary: &str, vector_path: &Path) -> Result<String, VerifierError> {
    let output = Command::new(go_binary)
        .arg("run")
        .arg(vector_path)
        .output()
        .map_err(|e| VerifierError::GoOracle(format!(
            "failed to execute '{} run {}': {}",
            go_binary, vector_path.display(), e
        )))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(VerifierError::GoOracle(format!(
            "oracle exited with {}: {}",
            output.status, stderr
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let hash = stdout.trim().to_string();
    if hash.is_empty() {
        return Err(VerifierError::GoOracle("empty hash from oracle".into()));
    }
    if hash.len() != 64 {
        return Err(VerifierError::GoOracle(format!(
            "expected 64-char hex hash, got {} chars: '{}'",
            hash.len(), hash
        )));
    }
    Ok(hash)
}

/// Check if the Go oracle binary is available.
pub fn check_oracle(go_binary: &str) -> Result<(), VerifierError> {
    let output = Command::new(go_binary)
        .arg("version")
        .output()
        .map_err(|e| VerifierError::GoOracle(format!(
            "oracle '{}' not found: {}",
            go_binary, e
        )))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(VerifierError::GoOracle("oracle binary failed version check".into()))
    }
}
