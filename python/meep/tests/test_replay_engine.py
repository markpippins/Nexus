"""Tests for the Replay Engine (Station 6).

Covers all acceptance criteria:
  - Empty event log → all nodes PENDING, is_complete=False
  - Full execution log → all nodes COMPLETED, is_complete=True
  - Determinism: replay(log) === replay(log) for any valid log
  - Partial replay: replay_until(log, n) returns state as of event n
  - Partial replay with 0 events → same as empty replay
  - Mixed event log (with FAIL/SKIP) produces correct state reconstruction
  - Pure function: no side effects, no IO, no mutation of inputs
"""

import copy

from meep.models import CEREvent, CERLog, ExecutionState
from meep.replay_engine import replay, replay_until


# ── Helpers ────────────────────────────────────────────────────────────


def _make_event(
    event_id: str,
    node_id: str,
    event_type: str,
    execution_id: str = "ex-1",
    timestamp: str = "",
) -> CEREvent:
    return CEREvent(
        event_id=event_id,
        timestamp=timestamp or f"t{event_id}",
        execution_id=execution_id,
        node_id=node_id,
        event_type=event_type,  # type: ignore[arg-type]
    )


def _build_full_log() -> CERLog:
    """Build a CERLog representing a complete execution of 3 nodes."""
    log = CERLog()
    for i in range(3):
        log.append(_make_event(f"start-{i}", f"n{i}", "NODE_START"))
        log.append(_make_event(f"complete-{i}", f"n{i}", "NODE_COMPLETE"))
    return log


def _build_mixed_log() -> CERLog:
    """Build a log with COMPLETE, FAIL, and SKIP outcomes (3 nodes)."""
    log = CERLog()
    # n0: runs and completes
    log.append(_make_event("s0", "n0", "NODE_START"))
    log.append(_make_event("c0", "n0", "NODE_COMPLETE"))
    # n1: runs and fails
    log.append(_make_event("s1", "n1", "NODE_START"))
    log.append(_make_event("f1", "n1", "NODE_FAIL"))
    # n2: runs and is skipped
    log.append(_make_event("s2", "n2", "NODE_START"))
    log.append(_make_event("k2", "n2", "NODE_SKIP"))
    return log


# ── Acceptance: empty log ──────────────────────────────────────────────


def test_empty_log_via_cerlog():
    """An empty CERLog → empty state, nothing PENDING."""
    log = CERLog()
    state = replay(log)
    assert state.node_states == {}
    assert state.completed_nodes == []
    assert state.failed_nodes == []
    assert state.event_count == 0
    assert not state.is_complete


def test_empty_log_via_tuple():
    """An empty event tuple → empty state, nothing PENDING."""
    state = replay(())
    assert state.node_states == {}
    assert state.event_count == 0
    assert not state.is_complete


# ── Acceptance: full execution log ────────────────────────────────────


def test_full_execution_all_completed():
    """A full 3-node execution log → all nodes COMPLETED, is_complete=True."""
    log = _build_full_log()
    state = replay(log)
    assert state.node_states == {
        "n0": "COMPLETED", "n1": "COMPLETED", "n2": "COMPLETED",
    }
    assert set(state.completed_nodes) == {"n0", "n1", "n2"}
    assert state.failed_nodes == []
    assert state.event_count == 6
    assert state.is_complete


# ── Acceptance: determinism ───────────────────────────────────────────


def test_determinism_cerlog():
    """replay(log) === replay(log) for a CERLog."""
    log = _build_full_log()
    state_a = replay(log)
    state_b = replay(log)
    assert state_a == state_b


def test_determinism_tuple():
    """replay(log) === replay(log) for a raw event tuple."""
    events = tuple(_build_full_log().events)
    state_a = replay(events)
    state_b = replay(events)
    assert state_a == state_b


# ── Acceptance: partial replay ────────────────────────────────────────


def test_replay_until_midway():
    """replay_until(log, 2) returns state after the first 2 events."""
    log = _build_full_log()
    # First 2 events: start-0 (n0 RUNNING), complete-0 (n0 COMPLETED)
    state = replay_until(log, 2)
    assert state.node_states == {"n0": "COMPLETED"}
    assert state.completed_nodes == ["n0"]
    assert state.event_count == 2
    # n0 is the only known node and it completed — all known nodes are terminal
    assert state.is_complete


def test_replay_until_after_start():
    """replay_until(log, 1) captures a node in RUNNING state."""
    log = _build_full_log()
    state = replay_until(log, 1)
    assert state.node_states == {"n0": "RUNNING"}
    assert state.completed_nodes == []
    assert state.event_count == 1
    assert not state.is_complete


def test_replay_until_empty():
    """replay_until(log, 0) produces the same state as replay(empty)."""
    log = _build_full_log()
    state = replay_until(log, 0)
    assert state.node_states == {}
    assert state.event_count == 0
    assert not state.is_complete
    assert state == replay(())


def test_replay_until_full_log():
    """replay_until(log, len) is equivalent to replay(log)."""
    log = _build_full_log()
    state_full = replay(log)
    state_partial = replay_until(log, len(log))
    assert state_full == state_partial


# ── Acceptance: mixed event log ───────────────────────────────────────


def test_mixed_log_correct_state():
    """A log with COMPLETE + FAIL + SKIP events correctly reconstructs state."""
    log = _build_mixed_log()
    state = replay(log)
    assert state.node_states == {
        "n0": "COMPLETED",
        "n1": "FAILED",
        "n2": "SKIPPED",
    }
    assert state.completed_nodes == ["n0"]
    assert state.failed_nodes == ["n1"]
    assert state.event_count == 6
    assert state.is_complete


def test_mixed_log_not_complete_until_final_event():
    """Before the last event, mixed log shows incomplete state."""
    log = _build_mixed_log()
    # After event 5 (skip of n2), n2 is still in RUNNING state
    state = replay_until(log, 5)
    assert state.node_states == {
        "n0": "COMPLETED",
        "n1": "FAILED",
        "n2": "RUNNING",
    }
    assert not state.is_complete


# ── Acceptance: pure function guarantees ──────────────────────────────


def test_no_mutation_of_input_tuple():
    """replay() does not mutate its input event tuple."""
    log = _build_full_log()
    events = tuple(log.events)
    events_copy = copy.deepcopy(events)
    state = replay(events)  # noqa: F841
    assert events == events_copy, "input tuple was mutated"


def test_no_mutation_of_input_log():
    """replay() does not mutate the CERLog."""
    log = _build_full_log()
    tail_before = log.tail_hash
    state = replay(log)  # noqa: F841
    assert len(log) == 6
    assert log.tail_hash == tail_before
    assert log.events == tuple(log._events)  # noqa: no mutation to internal list


def test_no_mutation_of_events_replay_until():
    """replay_until() does not mutate input events."""
    log = _build_full_log()
    events = tuple(log.events)
    events_copy = copy.deepcopy(events)
    state = replay_until(events, 3)  # noqa: F841
    assert events == events_copy


# ── Edge cases ────────────────────────────────────────────────────────


def test_single_node_complete():
    """Single node that completes → is_complete=True."""
    log = CERLog()
    log.append(_make_event("s1", "n1", "NODE_START"))
    log.append(_make_event("c1", "n1", "NODE_COMPLETE"))
    state = replay(log)
    assert state.is_complete
    assert state.node_states["n1"] == "COMPLETED"
    assert state.event_count == 2


def test_node_fail_then_complete_is_terminal():
    """A failing node is terminal; is_complete when all nodes terminal."""
    log = CERLog()
    log.append(_make_event("s1", "n1", "NODE_START"))
    log.append(_make_event("f1", "n1", "NODE_FAIL"))
    state = replay(log)
    assert state.node_states["n1"] == "FAILED"
    assert state.failed_nodes == ["n1"]
    assert state.is_complete


def test_node_skip_is_terminal():
    """A skipped node is terminal; is_complete when all nodes terminal."""
    log = CERLog()
    log.append(_make_event("s1", "n1", "NODE_START"))
    log.append(_make_event("k1", "n1", "NODE_SKIP"))
    state = replay(log)
    assert state.node_states["n1"] == "SKIPPED"
    assert state.is_complete


def test_replay_until_mutates_neither_input_nor_return_value():
    """Ensure replay_until does not mutate log or return shared references."""
    log = _build_full_log()
    state = replay_until(log, 3)
    # Mutating the state should not affect subsequent replays
    state.completed_nodes.append("tampered")
    state2 = replay_until(log, 3)
    assert "tampered" not in state2.completed_nodes
