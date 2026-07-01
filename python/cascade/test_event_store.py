"""test_event_store.py — Event store and state machine tests.

Tests the pure-Python event-sourcing layer without requiring a database:
  - State transition matrix enforcement
  - Event folding (replay) produces correct state
  - Invalid transitions are rejected
  - Vision IR stage tracking
  - Deterministic replay

Usage::

    cd /home/codex/dev/nexus/python/cascade
    python3 -m pytest test_event_store.py -v
"""

import pytest

from event_store import (
    LedgerEvent,
    LedgerEventType,
    LedgerState,
    WorkRequestState,
    VisionIRStage,
    TRANSITION_MATRIX,
    TERMINAL_STATES,
    validate_transition,
    is_terminal,
    fold_events,
    reduce_event,
)
from state_machine import (
    InvalidTransitionError,
    assert_transition,
    check_transition,
    apply_transition,
    create_initial_state,
    replay_to_state,
    get_reachable_states,
    get_all_paths_to,
)


def _make_event(
    seq: int,
    event_type: str,
    payload: dict | None = None,
    wr_id: str = "wr-001",
) -> LedgerEvent:
    return LedgerEvent(
        event_id=f"evt-{seq:03d}",
        work_request_id=wr_id,
        event_type=event_type,
        sequence_number=seq,
        payload=payload or {},
    )


class TestTransitionMatrix:
    def test_proposed_to_planning(self):
        assert validate_transition(WorkRequestState.PROPOSED, WorkRequestState.PLANNING)

    def test_proposed_to_cancelled(self):
        assert validate_transition(WorkRequestState.PROPOSED, WorkRequestState.CANCELLED)

    def test_proposed_to_pending_rejected(self):
        assert not validate_transition(WorkRequestState.PROPOSED, WorkRequestState.PENDING)

    def test_planning_to_pending(self):
        assert validate_transition(WorkRequestState.PLANNING, WorkRequestState.PENDING)

    def test_pending_to_implementing(self):
        assert validate_transition(WorkRequestState.PENDING, WorkRequestState.IMPLEMENTING)

    def test_implementing_to_review(self):
        assert validate_transition(WorkRequestState.IMPLEMENTING, WorkRequestState.REVIEW)

    def test_review_to_completed(self):
        assert validate_transition(WorkRequestState.REVIEW, WorkRequestState.COMPLETED)

    def test_review_to_implementing(self):
        assert validate_transition(WorkRequestState.REVIEW, WorkRequestState.IMPLEMENTING)

    def test_review_to_failed(self):
        assert validate_transition(WorkRequestState.REVIEW, WorkRequestState.FAILED)

    def test_implementing_to_failed(self):
        assert validate_transition(WorkRequestState.IMPLEMENTING, WorkRequestState.FAILED)

    def test_completed_is_terminal(self):
        assert is_terminal(WorkRequestState.COMPLETED)
        assert not validate_transition(WorkRequestState.COMPLETED, WorkRequestState.PROPOSED)

    def test_failed_is_terminal(self):
        assert is_terminal(WorkRequestState.FAILED)

    def test_cancelled_is_terminal(self):
        assert is_terminal(WorkRequestState.CANCELLED)

    def test_all_states_in_matrix(self):
        for state in WorkRequestState:
            assert state in TRANSITION_MATRIX


class TestStateMachine:
    def test_assert_valid_transition(self):
        assert_transition(WorkRequestState.PROPOSED, WorkRequestState.PLANNING)

    def test_assert_invalid_raises(self):
        with pytest.raises(InvalidTransitionError):
            assert_transition(WorkRequestState.COMPLETED, WorkRequestState.PROPOSED)

    def test_check_transition_valid(self):
        result = check_transition(WorkRequestState.PROPOSED, WorkRequestState.PLANNING)
        assert result.valid
        assert result.error is None

    def test_check_transition_invalid(self):
        result = check_transition(WorkRequestState.COMPLETED, WorkRequestState.PROPOSED)
        assert not result.valid
        assert result.error is not None

    def test_apply_transition(self):
        state = create_initial_state("wr-001")
        new_state = apply_transition(state, WorkRequestState.PLANNING, event_id="evt-001")
        assert new_state.current_state == WorkRequestState.PLANNING
        assert new_state.version == 1
        assert new_state.last_event_id == "evt-001"

    def test_apply_invalid_transition_raises(self):
        state = create_initial_state("wr-001")
        with pytest.raises(InvalidTransitionError):
            apply_transition(state, WorkRequestState.COMPLETED)

    def test_get_reachable_states(self):
        reachable = get_reachable_states(WorkRequestState.PROPOSED)
        assert WorkRequestState.PLANNING in reachable
        assert WorkRequestState.CANCELLED in reachable
        assert WorkRequestState.COMPLETED not in reachable

    def test_get_all_paths_to_completed(self):
        paths = get_all_paths_to(WorkRequestState.COMPLETED)
        assert len(paths) > 0
        for path in paths:
            assert path[0] == WorkRequestState.PROPOSED
            assert path[-1] == WorkRequestState.COMPLETED


class TestEventFolding:
    def test_empty_events_initial_state(self):
        state = fold_events("wr-001", [])
        assert state.current_state == WorkRequestState.PROPOSED
        assert state.version == 0

    def test_created_event_sets_proposed(self):
        events = [_make_event(1, LedgerEventType.WORKREQUEST_CREATED.value)]
        state = fold_events("wr-001", events)
        assert state.current_state == WorkRequestState.PROPOSED
        assert state.version == 1
        assert state.last_event_id == "evt-001"

    def test_three_events_full_lifecycle(self):
        events = [
            _make_event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _make_event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "PLANNING"}),
            _make_event(3, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "PENDING"}),
        ]
        state = fold_events("wr-001", events)
        assert state.current_state == WorkRequestState.PENDING
        assert state.version == 3
        assert state.last_event_id == "evt-003"

    def test_five_events_to_implementing(self):
        events = [
            _make_event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _make_event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "PLANNING"}),
            _make_event(3, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "PENDING"}),
            _make_event(4, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "IMPLEMENTING"}),
            _make_event(5, LedgerEventType.VISION_IR_PRODUCED.value,
                        {"ir_stage": "EXECUTION_IR", "ir_version": 2}),
        ]
        state = fold_events("wr-001", events)
        assert state.current_state == WorkRequestState.IMPLEMENTING
        assert state.vision_stage == VisionIRStage.EXECUTION_IR
        assert state.vision_ir_version == 2
        assert state.version == 5

    def test_full_lifecycle_to_completed(self):
        events = [
            _make_event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _make_event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "PLANNING"}),
            _make_event(3, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "PENDING"}),
            _make_event(4, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "IMPLEMENTING"}),
            _make_event(5, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "REVIEW"}),
            _make_event(6, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "COMPLETED"}),
        ]
        state = fold_events("wr-001", events)
        assert state.current_state == WorkRequestState.COMPLETED
        assert is_terminal(state.current_state)
        assert state.version == 6

    def test_invalid_transition_in_event_skipped(self):
        events = [
            _make_event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _make_event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "COMPLETED"}),
        ]
        state = fold_events("wr-001", events)
        assert state.current_state == WorkRequestState.PROPOSED
        assert state.version == 2

    def test_vision_ir_stage_tracking(self):
        events = [
            _make_event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _make_event(2, LedgerEventType.VISION_IR_PRODUCED.value,
                        {"ir_stage": "PLAN_IR", "ir_version": 1}),
            _make_event(3, LedgerEventType.VISION_IR_PRODUCED.value,
                        {"ir_stage": "SPEC_IR", "ir_version": 2}),
        ]
        state = fold_events("wr-001", events)
        assert state.vision_stage == VisionIRStage.SPEC_IR
        assert state.vision_ir_version == 2

    def test_deterministic_replay(self):
        events = [
            _make_event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _make_event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "PLANNING"}),
            _make_event(3, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "PENDING"}),
        ]
        state1 = fold_events("wr-001", events)
        state2 = fold_events("wr-001", events)
        assert state1.current_state == state2.current_state
        assert state1.version == state2.version
        assert state1.last_event_id == state2.last_event_id

    def test_out_of_order_sorted_by_sequence(self):
        events = [
            _make_event(3, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "PENDING"}),
            _make_event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _make_event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "PLANNING"}),
        ]
        state = fold_events("wr-001", events)
        assert state.current_state == WorkRequestState.PENDING
        assert state.version == 3

    def test_cancelled_path(self):
        events = [
            _make_event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _make_event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "CANCELLED"}),
        ]
        state = fold_events("wr-001", events)
        assert state.current_state == WorkRequestState.CANCELLED
        assert is_terminal(state.current_state)

    def test_review_back_to_implementing(self):
        events = [
            _make_event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _make_event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "PLANNING"}),
            _make_event(3, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "PENDING"}),
            _make_event(4, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "IMPLEMENTING"}),
            _make_event(5, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "REVIEW"}),
            _make_event(6, LedgerEventType.STATE_TRANSITION_COMMITTED.value,
                        {"new_state": "IMPLEMENTING"}),
        ]
        state = fold_events("wr-001", events)
        assert state.current_state == WorkRequestState.IMPLEMENTING
        assert state.version == 6

    def test_non_state_events_preserve_state(self):
        events = [
            _make_event(1, LedgerEventType.WORKREQUEST_CREATED.value),
            _make_event(2, LedgerEventType.EXECUTION_STARTED.value),
            _make_event(3, LedgerEventType.SYSTEM_CRON_TRIGGERED.value),
        ]
        state = fold_events("wr-001", events)
        assert state.current_state == WorkRequestState.PROPOSED
        assert state.version == 3
        assert state.last_event_id == "evt-003"


class TestLedgerEvent:
    def test_to_dict(self):
        event = _make_event(1, LedgerEventType.WORKREQUEST_CREATED.value)
        d = event.to_dict()
        assert d["event_type"] == "WORKREQUEST.CREATED"
        assert d["sequence_number"] == 1

    def test_from_row(self):
        row = {
            "event_id": "abc-123",
            "work_request_id": "wr-001",
            "event_type": "WORKREQUEST.CREATED",
            "event_version": 1,
            "correlation_id": None,
            "causation_id": None,
            "occurred_at": "2026-06-30T00:00:00Z",
            "payload": {},
            "actor_type": "system",
            "actor_id": "",
            "sequence_number": 42,
        }
        event = LedgerEvent.from_row(row)
        assert event.event_id == "abc-123"
        assert event.sequence_number == 42
