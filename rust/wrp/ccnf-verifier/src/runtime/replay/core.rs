use std::collections::HashMap;
use super::types::{ReplayEvent, StateDelta, RuntimeState, StateKey, StateValue};

pub fn initial_state() -> RuntimeState {
    RuntimeState {
        data: HashMap::new(),
        version: 0,
    }
}

pub fn apply(prev: RuntimeState, delta: StateDelta) -> RuntimeState {
    let mut data: HashMap<StateKey, StateValue> = HashMap::new();
    for (k, v) in prev.data {
        data.insert(k, v);
    }
    for (k, v) in delta.writes {
        data.insert(k, v);
    }
    RuntimeState {
        data,
        version: prev.version + 1,
    }
}

pub fn fold(events: &[ReplayEvent]) -> RuntimeState {
    let mut state = initial_state();
    for event in events {
        state = apply(state, event.delta.clone());
    }
    state
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_delta(kv: Vec<(&str, &[u8])>) -> StateDelta {
        let mut writes = HashMap::new();
        for (k, v) in kv {
            writes.insert(k.to_string(), v.to_vec());
        }
        StateDelta { writes }
    }

    #[test]
    fn test_initial_state() {
        let s = initial_state();
        assert_eq!(s.version, 0);
        assert!(s.data.is_empty());
    }

    #[test]
    fn test_apply_single() {
        let s = initial_state();
        let delta = make_delta(vec![("key1", b"value1")]);
        let s2 = apply(s, delta);

        assert_eq!(s2.version, 1);
        assert_eq!(s2.data.get("key1").map(|v| v.as_slice()), Some(&b"value1"[..]));
    }

    #[test]
    fn test_apply_overwrite() {
        let s = initial_state();
        let s = apply(s, make_delta(vec![("k", b"v1")]));
        let s = apply(s, make_delta(vec![("k", b"v2")]));

        assert_eq!(s.data.get("k").map(|v| v.as_slice()), Some(&b"v2"[..]));
        assert_eq!(s.version, 2);
    }

    #[test]
    fn test_fold_empty() {
        let s = fold(&[]);
        assert_eq!(s.version, 0);
    }

    #[test]
    fn test_fold_single() {
        let events = vec![ReplayEvent {
            event_id: "e1".into(),
            prev_event_id: "".into(),
            delta: make_delta(vec![("x", b"10")]),
            delta_hash: "".into(),
        }];
        let s = fold(&events);
        assert_eq!(s.data.get("x").map(|v| v.as_slice()), Some(&b"10"[..]));
        assert_eq!(s.version, 1);
    }

    #[test]
    fn test_fold_multiple() {
        let events = vec![
            ReplayEvent {
                event_id: "e1".into(), prev_event_id: "".into(),
                delta: make_delta(vec![("counter", b"1")]),
                delta_hash: "".into(),
            },
            ReplayEvent {
                event_id: "e2".into(), prev_event_id: "e1".into(),
                delta: make_delta(vec![("counter", b"2")]),
                delta_hash: "".into(),
            },
            ReplayEvent {
                event_id: "e3".into(), prev_event_id: "e2".into(),
                delta: make_delta(vec![("status", b"done")]),
                delta_hash: "".into(),
            },
        ];
        let s = fold(&events);
        assert_eq!(s.data.get("counter").map(|v| v.as_slice()), Some(&b"2"[..]));
        assert_eq!(s.data.get("status").map(|v| v.as_slice()), Some(&b"done"[..]));
        assert_eq!(s.version, 3);
    }

    #[test]
    fn test_fold_determinism() {
        let events = vec![
            ReplayEvent {
                event_id: "e1".into(), prev_event_id: "".into(),
                delta: make_delta(vec![("a", b"1"), ("b", b"2")]),
                delta_hash: "".into(),
            },
            ReplayEvent {
                event_id: "e2".into(), prev_event_id: "e1".into(),
                delta: make_delta(vec![("c", b"3")]),
                delta_hash: "".into(),
            },
        ];

        let s1 = fold(&events);
        for _ in 0..5 {
            let s2 = fold(&events);
            assert_eq!(s2.version, s1.version);
            for (k, v) in &s1.data {
                assert_eq!(s2.data.get(k), Some(v));
            }
        }
    }
}
