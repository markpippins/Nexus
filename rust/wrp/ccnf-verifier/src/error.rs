use std::fmt;

#[derive(Debug)]
pub enum VerifierError {
    Io(String),
    JsonParse(String),
    GoOracle(String),
    HashMismatch { vector: String, rust: String, go: String },
    CerMismatch { vector: String, detail: String },
    MissingField(String),
    InvalidInput(String),
    CcnfVersionMismatch(String),
    IntentNormalization(String),
    ArtifactResolution(String),
}

impl fmt::Display for VerifierError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            VerifierError::Io(msg) => write!(f, "IO error: {}", msg),
            VerifierError::JsonParse(msg) => write!(f, "JSON parse: {}", msg),
            VerifierError::GoOracle(msg) => write!(f, "Go oracle: {}", msg),
            VerifierError::HashMismatch { vector, rust, go } => {
                write!(f, "HASH MISMATCH [{}]: rust={} go={}", vector, rust, go)
            }
            VerifierError::CerMismatch { vector, detail } => {
                write!(f, "CER MISMATCH [{}]: {}", vector, detail)
            }
            VerifierError::MissingField(field) => write!(f, "missing field: {}", field),
            VerifierError::InvalidInput(msg) => write!(f, "STRUCTURAL_PARSE_FAILURE: {}", msg),
            VerifierError::CcnfVersionMismatch(msg) => write!(f, "CCNF_VERSION_MISMATCH: {}", msg),
            VerifierError::IntentNormalization(msg) => write!(f, "INTENT_NORMALIZATION_FAILURE: {}", msg),
            VerifierError::ArtifactResolution(msg) => write!(f, "ARTIFACT_RESOLUTION_FAILURE: {}", msg),
        }
    }
}

impl std::error::Error for VerifierError {}

impl From<std::io::Error> for VerifierError {
    fn from(e: std::io::Error) -> Self {
        VerifierError::Io(e.to_string())
    }
}
