use super::types::ReplayInput;

#[derive(Debug)]
pub enum ReplayValidationError {
    EmptyEventList,
    EventCountMismatch { expected: u64, actual: usize },
    EmptyCerRootHash,
    EmptyTraceRootHash,
    EmptyEventID(usize),
}

impl std::fmt::Display for ReplayValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ReplayValidationError::EmptyEventList => write!(f, "REPLAY_INPUT: event list must not be empty"),
            ReplayValidationError::EventCountMismatch { expected, actual } => {
                write!(f, "REPLAY_INPUT: event_count mismatch: expected {}, got {}", expected, actual)
            }
            ReplayValidationError::EmptyCerRootHash => write!(f, "REPLAY_INPUT: cer_root_hash must not be empty"),
            ReplayValidationError::EmptyTraceRootHash => write!(f, "REPLAY_INPUT: trace_root_hash must not be empty"),
            ReplayValidationError::EmptyEventID(i) => write!(f, "REPLAY_INPUT: events[{}].event_id must not be empty", i),
        }
    }
}

pub fn validate_replay_input(input: &ReplayInput) -> Result<(), ReplayValidationError> {
    if input.events.is_empty() {
        return Err(ReplayValidationError::EmptyEventList);
    }
    if input.event_count == 0 {
        return Err(ReplayValidationError::EmptyEventList);
    }
    if (input.event_count as usize) != input.events.len() {
        return Err(ReplayValidationError::EventCountMismatch {
            expected: input.event_count,
            actual: input.events.len(),
        });
    }
    if input.cer_root_hash.is_empty() {
        return Err(ReplayValidationError::EmptyCerRootHash);
    }
    if input.trace_root_hash.is_empty() {
        return Err(ReplayValidationError::EmptyTraceRootHash);
    }
    for (i, e) in input.events.iter().enumerate() {
        if e.event_id.is_empty() {
            return Err(ReplayValidationError::EmptyEventID(i));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use crate::runtime::replay::types::*;

    fn valid_input() -> ReplayInput {
        ReplayInput {
            events: vec![ReplayEvent {
                event_id: "e1".into(),
                prev_event_id: "".into(),
                delta: StateDelta { writes: HashMap::new() },
                delta_hash: "".into(),
            }],
            cer_root_hash: "abc".into(),
            trace_root_hash: "def".into(),
            replay_binding_hash: "ghi".into(),
            ccnf_version: 1,
            semantics_version: 1,
            event_count: 1,
        }
    }

    #[test]
    fn test_valid() {
        assert!(validate_replay_input(&valid_input()).is_ok());
    }

    #[test]
    fn test_empty_events() {
        let mut input = valid_input();
        input.events.clear();
        input.event_count = 0;
        assert!(matches!(validate_replay_input(&input), Err(ReplayValidationError::EmptyEventList)));
    }

    #[test]
    fn test_count_mismatch() {
        let mut input = valid_input();
        input.event_count = 5;
        assert!(matches!(validate_replay_input(&input), Err(ReplayValidationError::EventCountMismatch { .. })));
    }

    #[test]
    fn test_empty_cer_root() {
        let mut input = valid_input();
        input.cer_root_hash.clear();
        assert!(matches!(validate_replay_input(&input), Err(ReplayValidationError::EmptyCerRootHash)));
    }

    #[test]
    fn test_empty_trace_root() {
        let mut input = valid_input();
        input.trace_root_hash.clear();
        assert!(matches!(validate_replay_input(&input), Err(ReplayValidationError::EmptyTraceRootHash)));
    }

    #[test]
    fn test_empty_event_id() {
        let mut input = valid_input();
        input.events[0].event_id.clear();
        assert!(matches!(validate_replay_input(&input), Err(ReplayValidationError::EmptyEventID(0))));
    }
}
