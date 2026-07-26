"""
Orange/red/silent-failure tests for state_machine.py.

Covers gaps the existing green-path tests don't touch:
  Orange — terminal-state guards, invalid transitions after cancellation
  Red    — duplicate event replay, rapid sequential transitions, event_id collision
  Silent — metamorphic: apply_transition then re-apply, interleaved WR events

Usage:
    cd /home/codex/dev/nexus/python/cascade
    python3 -m pytest test_state_machine_orange_red.py -v
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from event_store import (
    LedgerEvent, LedgerEventType, LedgerState, WorkRequestState, fold_events,
)
from state_machine import (
    InvalidTransitionError,
    assert_transition, check_transition, apply_transition,
    create_initial_state, replay_to_state,
)


def _event(seq, evt_type, payload=None, wr_id="wr-001"):
    return LedgerEvent(
        event_id=f"evt-{seq:03d}", work_request_id=wr_id,
        event_type=evt_type, sequence_number=seq,
        payload=payload or {},
    )


# ── Orange path: terminal-state guards ───────────────────────────────


class TestOrangeTerminalStateGuards(unittest.TestCase):
    """Orange-path: terminal states must reject ALL transitions."""

    def test_apply_transition_from_completed_raises(self):
        """Cannot transition from COMPLETED (terminal)."""
        state = LedgerState(work_request_id="wr", current_state=WorkRequestState.COMPLETED)
        with self.assertRaises(InvalidTransitionError):
            apply_transition(state, WorkRequestState.PROPOSED)

    def test_apply_transition_from_failed_raises(self):
        """Cannot transition from FAILED (terminal)."""
        state = LedgerState(work_request_id="wr", current_state=WorkRequestState.FAILED)
        with self.assertRaises(InvalidTransitionError):
            apply_transition(state, WorkRequestState.PLANNING)

    def test_apply_transition_from_cancelled_raises(self):
        """Cannot transition from CANCELLED (terminal)."""
        state = LedgerState(work_request_id="wr", current_state=WorkRequestState.CANCELLED)
        with self.assertRaises(InvalidTransitionError):
            apply_transition(state, WorkRequestState.PLANNING)

    def test_apply_transition_to_nonexistent_state(self):
        """Invalid transition in event should be skipped (not crash)."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "NONEXISTENT_STATE"}),
        ]
        state = fold_events("wr-001", events)
        self.assertEqual(state.current_state, WorkRequestState.PROPOSED)

    def test_apply_invalid_skip_within_transition_event(self):
        """Invalid state name (not an enum member) silently skipped."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "PROPOSED"}),  # PROPOSED → PROPOSED is invalid
        ]
        state = fold_events("wr-001", events)
        # Should still be PROPOSED because PROPOSED→PROPOSED is not valid
        self.assertEqual(state.current_state, WorkRequestState.PROPOSED)

    def test_check_transition_from_terminal(self):
        """check_transition returns invalid for terminal→anything."""
        result = check_transition(WorkRequestState.COMPLETED, WorkRequestState.PROPOSED)
        self.assertFalse(result.valid)
        self.assertIsNotNone(result.error)
        self.assertIn("Allowed", result.error)

    def test_assert_transition_error_message(self):
        """InvalidTransitionError should include the states and allowed targets."""
        try:
            assert_transition(WorkRequestState.COMPLETED, WorkRequestState.PLANNING)
            self.fail("Expected InvalidTransitionError")
        except InvalidTransitionError as e:
            msg = str(e)
            self.assertIn("COMPLETED", msg)
            self.assertIn("PLANNING", msg)
            self.assertIn("none", msg.lower())  # COMPLETED has no allowed targets


# ── Red path: duplicate events, concurrency simulation ────────────────


class TestRedDuplicateEvents(unittest.TestCase):
    """Red-path: duplicate events, event_id collisions, racing transitions."""

    def test_same_event_id_twice_in_replay(self):
        """If the same event_id appears twice, replay still works."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),  # duplicate seq+id
        ]
        state = fold_events("wr-001", events)
        # Both have seq=1, sort stable by sequence, both are same event
        self.assertEqual(state.current_state, WorkRequestState.PROPOSED)

    def test_duplicate_transition_both_applied(self):
        """Same transition committed twice → both applied (no idempotency check)."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "PLANNING"}),
            _event(3, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "PLANNING"}),  # duplicate transition
        ]
        state = fold_events("wr-001", events)
        # Both are valid PROPOSED→PLANNING, so state is PLANNING
        self.assertEqual(state.current_state, WorkRequestState.PLANNING)
        self.assertEqual(state.version, 3)

    def test_rapid_transition_chain(self):
        """Many rapid sequential transitions must all apply correctly."""
        transitions = [
            (1, "PLANNING"), (2, "PENDING"), (3, "IMPLEMENTING"),
            (4, "REVIEW"), (5, "IMPLEMENTING"),  # rework
            (6, "REVIEW"), (7, "COMPLETED"),
        ]
        events = [_event(0, LedgerEventType.WORKREQUEST_CREATED.value)]
        for i, (seq, target) in enumerate(transitions, start=1):
            events.append(_event(seq, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                                 {"new_state": target}))
        state = fold_events("wr-001", events)
        self.assertEqual(state.current_state, WorkRequestState.COMPLETED)
        self.assertEqual(state.version, 1 + len(transitions))

    def test_cancel_then_attempt_resurrect(self):
        """Once cancelled (terminal), further transitions should be skipped."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "CANCELLED"}),
            _event(3, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "PLANNING"}),  # should be skipped (terminal)
        ]
        state = fold_events("wr-001", events)
        self.assertEqual(state.current_state, WorkRequestState.CANCELLED)

    def test_fail_then_attempt_complete(self):
        """Once failed (terminal), cannot complete."""
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
            _event(6, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "COMPLETED"}),  # terminal: skipped
        ]
        state = fold_events("wr-001", events)
        self.assertEqual(state.current_state, WorkRequestState.FAILED)


class TestRedInterleavedWorkRequests(unittest.TestCase):
    """Red-path: events from multiple work requests interleaved."""

    def test_interleaved_events_correct_per_wr(self):
        """Events from two WRs interleaved should be correctly foldable
        when pre-filtered by WR id. fold_events processes ALL events
        regardless of wr_id, so callers must filter first."""
        wr1_events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value, wr_id="wr-1"),
            _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "PLANNING"}, wr_id="wr-1"),
        ]
        wr2_events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value, wr_id="wr-2"),
            _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "CANCELLED"}, wr_id="wr-2"),
        ]

        # Interleave
        interleaved = [wr1_events[0], wr2_events[0], wr1_events[1], wr2_events[1]]

        # Pre-filter by wr_id before folding
        s1 = fold_events("wr-1", [e for e in interleaved if e.work_request_id == "wr-1"])
        s2 = fold_events("wr-2", [e for e in interleaved if e.work_request_id == "wr-2"])
        self.assertEqual(s1.current_state, WorkRequestState.PLANNING)
        self.assertEqual(s2.current_state, WorkRequestState.CANCELLED)


# ── Silent failure: metamorphic / idempotency ─────────────────────────


class TestSilentFailureStateMachine(unittest.TestCase):
    """Silent-failure: detect state machine bugs through metamorphic testing."""

    def test_apply_transition_twice_same_result(self):
        """Applying the same valid transition twice on same initial state
        yields identical final states (idempotency at the state level, not event level)."""
        s1 = create_initial_state("wr")
        s1 = apply_transition(s1, WorkRequestState.PLANNING, "e1")
        s2 = create_initial_state("wr")
        s2 = apply_transition(s2, WorkRequestState.PLANNING, "e1")
        self.assertEqual(s1.current_state, s2.current_state)
        self.assertEqual(s1.version, s2.version)

    def test_version_increments_for_every_event(self):
        """Version must increment for every event, even non-state-changing ones."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(2, LedgerEventType.EXECUTION_STARTED.value),
            _event(3, LedgerEventType.SYSTEM_CRON_TRIGGERED.value),
            _event(4, LedgerEventType.EXECUTION_COMPLETED.value),
        ]
        state = fold_events("wr", events)
        self.assertEqual(state.version, 4)

    def test_initial_state_for_different_wrs_are_identical(self):
        """Two different work request IDs both start at PROPOSED."""
        s1 = create_initial_state("wr-a")
        s2 = create_initial_state("wr-b")
        self.assertEqual(s1.current_state, s2.current_state)
        self.assertEqual(s1.version, s2.version)

    def test_replay_to_state_uses_fold_events(self):
        """replay_to_state delegates to fold_events correctly."""
        events = [
            _event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                   {"new_state": "PLANNING"}),
        ]
        state = replay_to_state("wr", events)
        self.assertEqual(state.current_state, WorkRequestState.PLANNING)


if __name__ == "__main__":
    unittest.main()
