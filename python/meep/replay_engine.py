"""Pure-function reducer that walks a CER event log and reconstructs ExecutionState.

The replay engine is a deterministic pure function: same event log → same
ExecutionState every time.  It supports full replay (all events) and
partial replay (up to a given event index).

Station 6 of the Phase 1 vertical slice.
"""

from collections.abc import Sequence

from meep.models import CEREvent, CERLog, ExecutionState, NodeState


TERMINAL_STATES: frozenset[NodeState] = frozenset(
    {"COMPLETED", "FAILED", "SKIPPED"}
)


def _events_from_input(
    log: CERLog | Sequence[CEREvent],
) -> Sequence[CEREvent]:
    """Extract the event sequence from either a CERLog or a raw sequence."""
    if isinstance(log, CERLog):
        return log.events
    return log


def _replay_events(events: Sequence[CEREvent]) -> ExecutionState:
    """Core reducer: walk events in order and build ExecutionState."""
    node_states: dict[str, NodeState] = {}
    completed_nodes: list[str] = []
    failed_nodes: list[str] = []

    for event in events:
        node_id = event.node_id

        if event.event_type == "NODE_START":
            node_states[node_id] = "RUNNING"
        elif event.event_type == "NODE_COMPLETE":
            node_states[node_id] = "COMPLETED"
            completed_nodes.append(node_id)
        elif event.event_type == "NODE_FAIL":
            node_states[node_id] = "FAILED"
            failed_nodes.append(node_id)
        elif event.event_type == "NODE_SKIP":
            node_states[node_id] = "SKIPPED"

    is_complete = (
        len(node_states) > 0
        and all(s in TERMINAL_STATES for s in node_states.values())
    )

    return ExecutionState(
        node_states=node_states,
        completed_nodes=completed_nodes,
        failed_nodes=failed_nodes,
        event_count=len(events),
        is_complete=is_complete,
    )


def replay(log: CERLog | Sequence[CEREvent]) -> ExecutionState:
    """Replay the full CER event log and reconstruct the ExecutionState.

    Parameters
    ----------
    log: CERLog | Sequence[CEREvent]
        The event log to replay.  Accepts either a CERLog instance or a
        raw sequence of CEREvent objects.

    Returns
    -------
    ExecutionState
        Reconstructed execution state after processing all events.

    Pure function: no side effects, no IO, no mutation of inputs.
    """
    events = _events_from_input(log)
    return _replay_events(events)


def replay_until(
    log: CERLog | Sequence[CEREvent],
    n: int,
) -> ExecutionState:
    """Replay the event log up to (but not including) event index *n*.

    Parameters
    ----------
    log: CERLog | Sequence[CEREvent]
        The event log to replay.
    n: int
        The exclusive event index to stop at.  ``n=0`` produces the same
        result as replaying an empty log.

    Returns
    -------
    ExecutionState
        Reconstructed execution state as of event *n*.

    Pure function: no side effects, no IO, no mutation of inputs.
    """
    events = _events_from_input(log)
    return _replay_events(events[:n])
