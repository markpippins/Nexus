"""
Orange/red/silent-failure tests for event_store.py.

Covers gaps the existing green-path tests don't touch:
  Orange — malformed payloads, missing new_state, non-dict payload
  Red    — duplicate event_ids, events from unknown WR, null values
  Silent — wrong-order events with same timestamp, events after terminal

Usage:
    cd /home/codex/dev/nexus/python/cascade
    python3 -m pytest test_event_store_orange_red.py -v
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from event_store import (
    LedgerEvent, LedgerEventType, LedgerState, WorkRequestState,
    VisionIRStage, fold_events, reduce_event, validate_transition,
)


# ── Sentinel to distinguish explicit None from missing payload ────
_NOT_GIVEN = object()


def _event(seq, evt_type, payload=_NOT_GIVEN, wr_id="wr-001", event_id=None):
    """Create a LedgerEvent. Use _NOT_GIVEN sentinel to distinguish
    None payload from no-payload (which defaults to {}).
    """
    if payload is _NOT_GIVEN:
        payload = {}
    return LedgerEvent(
        event_id=event_id or f"evt-{seq:03d}",
        work_request_id=wr_id,
        event_type=evt_type,
        sequence_number=seq,
        payload=payload,
    )


class TestOrangeMalformedPayloads(unittest.TestCase):
    """Orange-path: events with malformed or missing payload fields."""

    def test_state_transition_missing_new_state(self):
        """STATE_TRANSITION_COMMITTED without 'new_state' key → no state change."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value, {}),
        ]
        state = fold_events("wr-001", events)
        self.assertEqual(state.current_state, WorkRequestState.PROPOSED)
        self.assertEqual(state.version, 2)

    def test_state_transition_new_state_is_none(self):
        """STATE_TRANSITION_COMMITTED with new_state=None → no state change."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": None}),
        ]
        state = fold_events("wr-001", events)
        self.assertEqual(state.current_state, WorkRequestState.PROPOSED)

    def test_state_transition_new_state_is_number(self):
        """STATE_TRANSITION_COMMITTED with new_state=42 (not a string) → skipped."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": 42}),
        ]
        state = fold_events("wr-001", events)
        # WorkRequestState(42) would fail, so this should be caught
        self.assertEqual(state.current_state, WorkRequestState.PROPOSED)

    def test_vision_ir_produced_missing_ir_stage(self):
        """VISION_IR_PRODUCED without ir_stage → vision unchanged."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(2, LedgerEventType.VISION_IR_PRODUCED.value, {}),
        ]
        state = fold_events("wr-001", events)
        self.assertIsNone(state.vision_stage)
        self.assertEqual(state.vision_ir_version, 0)

    def test_vision_ir_produced_invalid_ir_stage(self):
        """VISION_IR_PRODUCED with invalid stage name → vision unchanged."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(2, LedgerEventType.VISION_IR_PRODUCED.value,
                   {"ir_stage": "NONEXISTENT_STAGE"}),
        ]
        state = fold_events("wr-001", events)
        self.assertIsNone(state.vision_stage)

    def test_unknown_event_type_preserves_state(self):
        """Completely unknown event type should not crash — just preserves state."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(2, "UNKNOWN.EVENT.TYPE"),
        ]
        state = fold_events("wr-001", events)
        self.assertEqual(state.current_state, WorkRequestState.PROPOSED)
        self.assertEqual(state.version, 2)

    def test_payload_is_none_not_dict(self):
        """Event with payload=None instead of dict should not crash."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value, payload=None),
        ]
        state = fold_events("wr-001", events)
        self.assertEqual(state.current_state, WorkRequestState.PROPOSED)

    def test_payload_is_list_not_dict(self):
        """Event with payload=[] should not crash (lists are falsy but valid)."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value, payload=[]),
        ]
        state = fold_events("wr-001", events)
        self.assertEqual(state.current_state, WorkRequestState.PROPOSED)


# ── Red path: duplicate events, data integrity ────────────────────────


class TestRedDuplicateEventIds(unittest.TestCase):
    """Red-path: duplicate event_ids, collision scenarios."""

    def test_two_events_same_event_id(self):
        """Two events sharing the same event_id but different sequences."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value, event_id="same-id"),
            _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "CANCELLED"}, event_id="same-id"),
        ]
        state = fold_events("wr-001", events)
        # Both processed — event_id is not unique-checked in fold_events
        self.assertEqual(state.current_state, WorkRequestState.CANCELLED)

    def test_missing_work_request_id(self):
        """Event with empty work_request_id still processed."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value, wr_id=""),
        ]
        state = fold_events("", events)
        self.assertEqual(state.current_state, WorkRequestState.PROPOSED)

    def test_events_from_different_wr_in_same_fold(self):
        """fold_events processes ALL events regardless of wr_id.

        This is by design: fold_events doesn't filter by wr_id.
        Callers must pre-filter if they only want one WR's events.
        """
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value, wr_id="wr-A"),
            _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "PLANNING"}, wr_id="wr-B"),
        ]
        state = fold_events("wr-A", events)
        # Both events processed — the second event's wr_id is ignored
        self.assertEqual(state.current_state, WorkRequestState.PLANNING)

    def test_many_events_out_of_order(self):
        """Completely shuffled sequence numbers should sort correctly."""
        events = [
            _event(5, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "REVIEW"}),
            _event(3, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "PENDING"}),
            _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "PLANNING"}),
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(4, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "IMPLEMENTING"}),
        ]
        state = fold_events("wr-001", events)
        self.assertEqual(state.current_state, WorkRequestState.REVIEW)
        self.assertEqual(state.version, 5)

    def test_negative_sequence_numbers(self):
        """Events with negative sequence numbers still sorted correctly."""
        events = [
            _event(-1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(0, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "PLANNING"}),
            _event(1, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "PENDING"}),
        ]
        state = fold_events("wr-001", events)
        self.assertEqual(state.current_state, WorkRequestState.PENDING)


# ── Silent failure: metamorphic / edge case detection ──────────────────


class TestSilentFailureEventStore(unittest.TestCase):
    """Silent-failure: edge cases that produce plausible-but-wrong results."""

    def test_terminal_state_stays_terminal_through_many_events(self):
        """Once terminal, no amount of events should change state."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "CANCELLED"}),
            _event(3, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "PLANNING"}),
            _event(4, LedgerEventType.VISION_IR_PRODUCED.value,
                   {"ir_stage": "EXECUTION_IR", "ir_version": 5}),
            _event(5, LedgerEventType.EXECUTION_STARTED.value),
            _event(6, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "COMPLETED"}),
        ]
        state = fold_events("wr-001", events)
        self.assertEqual(state.current_state, WorkRequestState.CANCELLED)
        # Version should still increment for all events processed
        self.assertEqual(state.version, 6)

    def test_vision_ir_stage_can_advance_despite_terminal_state(self):
        """Vision IR stage can still advance even if WR is terminal.

        This is a design choice: terminal WR state doesn't block
        IR artifact tracking. But it could be surprising.

        Must progress through valid states to reach FAILED first:
        PROPOSED → PLANNING → PENDING → IMPLEMENTING → FAILED.
        """
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "PLANNING"}),
            _event(3, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "PENDING"}),
            _event(4, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "IMPLEMENTING"}),
            _event(5, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "FAILED"}),
            _event(6, LedgerEventType.VISION_IR_PRODUCED.value,
                   {"ir_stage": "VALIDATION_IR", "ir_version": 3}),
        ]
        state = fold_events("wr-001", events)
        self.assertEqual(state.current_state, WorkRequestState.FAILED)
        # Vision stage advanced despite WR being FAILED
        self.assertEqual(state.vision_stage, VisionIRStage.VALIDATION_IR)

    def test_reduce_event_does_not_mutate_input_state(self):
        """reduce_event returns a new state, never mutates the input."""
        initial = LedgerState(work_request_id="wr-001")
        event = _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                       {"new_state": "PLANNING"})
        result = reduce_event(initial, event)
        self.assertIsNot(initial, result, "reduce_event must return a new object")
        self.assertEqual(initial.current_state, WorkRequestState.PROPOSED)
        self.assertEqual(initial.version, 0)

    def test_fold_with_single_event_equals_reduce(self):
        """fold_events([event]) should equal reduce_event(initial, event)."""
        event = _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                       {"new_state": "PLANNING"})
        from_fold = fold_events("wr", [event])
        from_reduce = reduce_event(LedgerState(work_request_id="wr"), event)
        self.assertEqual(from_fold.current_state, from_reduce.current_state)
        self.assertEqual(from_fold.version, from_reduce.version)

    def test_version_always_monotonic(self):
        """Version must never decrease across event application."""
        events = [_event(i, LedgerEventType.WORKREQUEST_CREATED.value)
                  for i in range(10)]
        state = fold_events("wr", events)
        self.assertEqual(state.version, 10)

    def test_empty_fold_preserves_zero_version(self):
        """fold with no events → version 0."""
        state = fold_events("wr", [])
        self.assertEqual(state.version, 0)


if __name__ == "__main__":
    unittest.main()
