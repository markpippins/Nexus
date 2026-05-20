use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct ReplayInput {
    pub events: Vec<ReplayEvent>,
    pub cer_root_hash: String,
    pub trace_root_hash: String,
    pub replay_binding_hash: String,
    pub ccnf_version: u32,
    pub semantics_version: u32,
    pub event_count: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ReplayEvent {
    pub event_id: String,
    pub prev_event_id: String,
    pub delta: StateDelta,
    pub delta_hash: String,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct StateDelta {
    pub writes: HashMap<StateKey, StateValue>,
}

pub type StateKey = String;
pub type StateValue = Vec<u8>;

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeState {
    pub data: HashMap<StateKey, StateValue>,
    pub version: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ReplayOutput {
    pub final_state: RuntimeState,
    pub event_count: u64,
    pub cer_root_hash: String,
    pub trace_root_hash: String,
    pub replay_binding_hash: String,
}
