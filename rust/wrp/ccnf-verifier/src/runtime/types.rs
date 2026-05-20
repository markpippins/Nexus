#[derive(Debug, Clone, PartialEq)]
pub struct ExecutionRequest {
    pub request_id: String,
    pub version: VersionTriple,
    pub timestamp: i64,
    pub source: String,
    pub payload: serde_json::Value,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct VersionTriple {
    pub ccnf: u32,
    pub collapse_engine: u32,
    pub rehydration: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionStatus {
    Success,
    Failure,
    Partial,
}

impl ExecutionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            ExecutionStatus::Success => "SUCCESS",
            ExecutionStatus::Failure => "FAILURE",
            ExecutionStatus::Partial => "PARTIAL",
        }
    }

    pub fn from_str(s: &str) -> Option<ExecutionStatus> {
        match s {
            "SUCCESS" => Some(ExecutionStatus::Success),
            "FAILURE" => Some(ExecutionStatus::Failure),
            "PARTIAL" => Some(ExecutionStatus::Partial),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct FailureNode {
    pub code: String,
    pub message: String,
    pub cause: Option<Box<FailureNode>>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Timing {
    pub started_at: i64,
    pub completed_at: i64,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ExecutionReceipt {
    pub request_id: String,
    pub ccnf_hash: String,
    pub cer_root_hash: String,
    pub trace_root_hash: String,
    pub trace_event_count: u64,
    pub replay_binding_hash: String,
    pub status: ExecutionStatus,
    pub failure: Option<FailureNode>,
    pub timing: Timing,
    pub ccnf_version: u32,
}
