"""state_machine.py — Pure-Python WorkRequest state machine.

Enforces the allowed transition matrix in-memory. Used by the event store
reducer and by tests to validate state transitions without DB access.

State machine::

    PROPOSED ──→ PLANNING ──→ PENDING ──→ IMPLEMENTING ──→ REVIEW ──→ COMPLETED
       │            │            │             │              │
       ↓            ↓            ↓             ↓              ↓
    CANCELLED    CANCELLED    CANCELLED     FAILED         FAILED
                                              ↑           IMPLEMENTING
                                              └─────────────┘

Terminal states: COMPLETED, FAILED, CANCELLED
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

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


class InvalidTransitionError(Exception):
    def __init__(self, from_state: WorkRequestState, to_state: WorkRequestState):
        allowed = TRANSITION_MATRIX.get(from_state, [])
        allowed_str = ", ".join(s.value for s in allowed) if allowed else "none (terminal)"
        super().__init__(
            f"INVALID_TRANSITION: {from_state.value} → {to_state.value} "
            f"not allowed. Allowed: {allowed_str}"
        )
        self.from_state = from_state
        self.to_state = to_state


def assert_transition(from_state: WorkRequestState, to_state: WorkRequestState) -> None:
    if not validate_transition(from_state, to_state):
        raise InvalidTransitionError(from_state, to_state)


@dataclass(frozen=True)
class TransitionResult:
    valid: bool
    from_state: WorkRequestState
    to_state: WorkRequestState
    error: str | None = None


def check_transition(from_state: WorkRequestState, to_state: WorkRequestState) -> TransitionResult:
    if validate_transition(from_state, to_state):
        return TransitionResult(valid=True, from_state=from_state, to_state=to_state)
    allowed = TRANSITION_MATRIX.get(from_state, [])
    return TransitionResult(
        valid=False,
        from_state=from_state,
        to_state=to_state,
        error=f"Allowed from {from_state.value}: {', '.join(s.value for s in allowed) or 'none'}",
    )


def apply_transition(
    state: LedgerState,
    new_state: WorkRequestState,
    event_id: str | None = None,
) -> LedgerState:
    assert_transition(state.current_state, new_state)
    return LedgerState(
        work_request_id=state.work_request_id,
        current_state=new_state,
        vision_stage=state.vision_stage,
        vision_ir_version=state.vision_ir_version,
        last_event_id=event_id or state.last_event_id,
        version=state.version + 1,
    )


def create_initial_state(work_request_id: str) -> LedgerState:
    return LedgerState(work_request_id=work_request_id)


def replay_to_state(work_request_id: str, events: list[LedgerEvent]) -> LedgerState:
    return fold_events(work_request_id, events)


def get_reachable_states(from_state: WorkRequestState) -> list[WorkRequestState]:
    return list(TRANSITION_MATRIX.get(from_state, []))


def get_all_paths_to(target: WorkRequestState) -> list[list[WorkRequestState]]:
    paths: list[list[WorkRequestState]] = []

    def _dfs(current: WorkRequestState, path: list[WorkRequestState], visited: set[WorkRequestState]) -> None:
        if current == target:
            paths.append(list(path))
            return
        for next_state in TRANSITION_MATRIX.get(current, []):
            if next_state in visited:
                continue
            visited.add(next_state)
            path.append(next_state)
            _dfs(next_state, path, visited)
            path.pop()
            visited.discard(next_state)

    _dfs(WorkRequestState.PROPOSED, [WorkRequestState.PROPOSED], {WorkRequestState.PROPOSED})
    return paths
