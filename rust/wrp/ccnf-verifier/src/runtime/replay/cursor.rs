use super::types::ReplayEvent;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Cursor {
    index: usize,
}

impl Cursor {
    pub fn new() -> Self {
        Cursor { index: 0 }
    }

    pub fn step(&self) -> Self {
        Cursor { index: self.index + 1 }
    }

    pub fn jump(&self, i: usize) -> Self {
        Cursor { index: i }
    }

    pub fn index(&self) -> usize {
        self.index
    }

    pub fn valid(&self, length: usize) -> bool {
        self.index < length
    }

    pub fn event<'a>(&self, events: &'a [ReplayEvent]) -> Option<&'a ReplayEvent> {
        events.get(self.index)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::replay::types::StateDelta;
    use std::collections::HashMap;

    fn make_events() -> Vec<ReplayEvent> {
        vec![
            ReplayEvent { event_id: "e1".into(), prev_event_id: "".into(), delta: StateDelta { writes: HashMap::new() }, delta_hash: "".into() },
            ReplayEvent { event_id: "e2".into(), prev_event_id: "e1".into(), delta: StateDelta { writes: HashMap::new() }, delta_hash: "".into() },
            ReplayEvent { event_id: "e3".into(), prev_event_id: "e2".into(), delta: StateDelta { writes: HashMap::new() }, delta_hash: "".into() },
        ]
    }

    #[test]
    fn test_cursor_navigation() {
        let events = make_events();

        let c = Cursor::new();
        assert_eq!(c.event(&events).unwrap().event_id, "e1");

        let c = c.step();
        assert_eq!(c.event(&events).unwrap().event_id, "e2");

        let c = c.step();
        assert_eq!(c.event(&events).unwrap().event_id, "e3");

        let c = c.step();
        assert!(c.event(&events).is_none());
    }

    #[test]
    fn test_cursor_jump() {
        let events = make_events();
        let c = Cursor::new().jump(2);
        assert_eq!(c.event(&events).unwrap().event_id, "e3");
    }

    #[test]
    fn test_cursor_valid() {
        let events = make_events();
        let c = Cursor::new();
        assert!(c.valid(events.len()));

        let c = Cursor::new().jump(10);
        assert!(!c.valid(events.len()));
    }
}
