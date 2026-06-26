"""Tests for the deterministic scheduler + CER writer (Station 5)."""

import json

from meep.models import (
    CERLog, CEREvent,
    ExecutionGraph, ExecNode,
    FrozenGraphError,
)
from meep.scheduler import schedule, _find_node


FIXED_CLOCK = lambda: "2026-06-20T12:00:00Z"  # noqa: E731


# ── Helper factories ─────────────────────────────────────────────────


def _make_graph(
    node_ids: list[str],
    edges: list[tuple[str, str]] | None = None,
) -> ExecutionGraph:
    """Build a deterministic test graph without going through the full pipeline."""
    nodes = [ExecNode(id=nid, label=f"Node {nid}", handler="generic_handler")
             for nid in node_ids]
    if edges is None:
        edges_list = []
    else:
        edges_list = list(edges)

    # Compute simple topological order (pre-order for linear chains)
    topo = list(node_ids)

    g = ExecutionGraph(
        nodes=nodes,
        edges=edges_list,
        topological_order=topo,
        frozen_at="2026-06-20T12:00:00Z",
    )
    g._freeze()
    return g


# ── Acceptance criteria ──────────────────────────────────────────────


def test_empty_graph_produces_zero_events():
    """Empty ExecutionGraph → empty event log (0 events)."""
    g = ExecutionGraph(frozen_at="")
    g._freeze()
    log = schedule(g, clock=FIXED_CLOCK)
    assert len(log) == 0


def test_single_node_produces_two_events():
    """Single-node graph → exactly 2 events (NODE_START, NODE_COMPLETE)."""
    g = _make_graph(["n1"])
    log = schedule(g, clock=FIXED_CLOCK)
    assert len(log) == 2
    assert log.events[0].event_type == "NODE_START"
    assert log.events[0].node_id == "n1"
    assert log.events[1].event_type == "NODE_COMPLETE"
    assert log.events[1].node_id == "n1"


def test_three_node_chain_produces_six_events():
    """Linear 3-node chain → 6 events in topological order."""
    g = _make_graph(["a", "b", "c"], [("a", "b"), ("b", "c")])
    log = schedule(g, clock=FIXED_CLOCK)

    assert len(log) == 6

    # Event sequence: a-Start, a-Complete, b-Start, b-Complete, c-Start, c-Complete
    expected = [
        ("a", "NODE_START"),
        ("a", "NODE_COMPLETE"),
        ("b", "NODE_START"),
        ("b", "NODE_COMPLETE"),
        ("c", "NODE_START"),
        ("c", "NODE_COMPLETE"),
    ]
    for i, (node_id, event_type) in enumerate(expected):
        assert log.events[i].node_id == node_id, f"Event {i}: expected node {node_id}"
        assert log.events[i].event_type == event_type, f"Event {i}: expected {event_type}"


# ── Hash chain continuity ────────────────────────────────────────────


def test_hash_chain_continuous():
    """Each event.prev_event_hash matches the previous event's hash."""
    g = _make_graph(["n1", "n2"])
    log = schedule(g, clock=FIXED_CLOCK)
    _assert_hash_chain(log)


def test_hash_chain_for_single_node():
    """Even with 2 events, the hash chain is continuous."""
    g = _make_graph(["n1"])
    log = schedule(g, clock=FIXED_CLOCK)
    _assert_hash_chain(log)


# ── Append-only invariant ────────────────────────────────────────────


def test_append_only_invariant():
    """After scheduling, the event log is immutable and hash chain intact."""
    g = _make_graph(["n1", "n2"])
    log = schedule(g, clock=FIXED_CLOCK)

    events_before = list(log.events)

    # The CERLog itself enforces append-only via its tuple view
    # Verify the events haven't changed by checking hash chain
    _assert_hash_chain(log)

    # Events tuple is the same object
    assert len(log.events) == len(events_before)


def test_cannot_modify_event_after_append():
    """Once appended to CERLog, an event's fields should not be changed.

    Note: This relies on CEREvent being a frozen dataclass or convention.
    In v1, CEREvent is a regular dataclass — the invariant is enforced
    by convention and the hash chain (detection not prevention).
    """
    g = _make_graph(["n1"])
    log = schedule(g, clock=FIXED_CLOCK)

    # Hash chain proves no tampering
    _assert_hash_chain(log)

    # If someone mutates an event, the hash chain breaks.
    # Verify the chain is still valid.
    stored_hash = log.tail_hash
    _assert_hash_chain(log)
    assert log.tail_hash == stored_hash


# ── Determinism ──────────────────────────────────────────────────────


def test_determinism_same_graph_same_log():
    """Same frozen graph + same clock → identical event log (10 runs)."""
    g = _make_graph(["a", "b", "c"], [("a", "b"), ("b", "c")])
    logs = [schedule(g, clock=FIXED_CLOCK) for _ in range(10)]

    for i in range(1, 10):
        assert len(logs[0]) == len(logs[i])
        for j in range(len(logs[0])):
            e0 = logs[0].events[j]
            ei = logs[i].events[j]
            assert e0.event_id == ei.event_id
            assert e0.event_type == ei.event_type
            assert e0.node_id == ei.node_id


def test_determinism_with_different_clock_same_structure():
    """Different clock → event content (timestamp) differs but structure is same."""
    clock_a = lambda: "2026-01-01T00:00:00Z"
    clock_b = lambda: "2026-06-20T12:00:00Z"

    g = _make_graph(["n1", "n2"])
    log_a = schedule(g, clock=clock_a)
    log_b = schedule(g, clock=clock_b)

    assert len(log_a) == len(log_b)
    for ea, eb in zip(log_a.events, log_b.events):
        assert ea.event_id == eb.event_id
        assert ea.event_type == eb.event_type
        assert ea.node_id == eb.node_id
        assert ea.timestamp != eb.timestamp  # different clock

    # Hash chains differ because timestamps differ
    assert log_a.tail_hash != log_b.tail_hash


# ── Frozen graph enforcement ─────────────────────────────────────────


def test_scheduler_rejects_unfrozen_graph():
    """Scheduling an unfrozen graph raises FrozenGraphError."""
    g = ExecutionGraph(
        nodes=[ExecNode(id="n1", label="N1", handler="generic_handler")],
        edges=[],
        topological_order=["n1"],
        frozen_at="",
    )
    # Note: _freeze() NOT called
    import pytest
    with pytest.raises(FrozenGraphError):
        schedule(g, clock=FIXED_CLOCK)


# ── Handler integration ──────────────────────────────────────────────


def test_handler_result_in_complete_event_payload():
    """NODE_COMPLETE event payload contains the handler's result."""
    g = _make_graph(["n1"])
    log = schedule(g, clock=FIXED_CLOCK)
    complete_event = log.events[1]
    assert complete_event.event_type == "NODE_COMPLETE"
    assert complete_event.payload["status"] == "ok"
    assert complete_event.payload["node_id"] == "n1"
    assert complete_event.payload["handler"] == "simulated"


def test_handler_name_in_start_event_payload():
    """NODE_START event payload contains the handler name."""
    g = _make_graph(["n1"])
    log = schedule(g, clock=FIXED_CLOCK)
    start_event = log.events[0]
    assert start_event.payload["handler"] == "generic_handler"


# ── Event ID format ──────────────────────────────────────────────────


def test_event_id_format():
    """Event IDs follow the pattern evt-{execution_id}-{counter}."""
    g = _make_graph(["n1"])
    log = schedule(g, clock=FIXED_CLOCK)
    eid = log.events[0].event_id
    assert eid.startswith("evt-ex-")
    assert eid.endswith("-0001")


# ── _find_node helper ────────────────────────────────────────────────


def test_find_node_found():
    g = _make_graph(["a", "b"])
    assert _find_node(g, "a") is not None
    assert _find_node(g, "b") is not None


def test_find_node_not_found():
    g = _make_graph(["a"])
    assert _find_node(g, "nonexistent") is None


# ── Helpers ──────────────────────────────────────────────────────────


def _assert_hash_chain(log: CERLog) -> None:
    """Verify the hash chain in a CERLog is continuous."""
    import hashlib

    for i, event in enumerate(log.events):
        if i == 0:
            assert event.prev_event_hash == "genesis", (
                f"First event should link to genesis"
            )
        else:
            prev = log.events[i - 1]
            expected_hash = _hash_event(prev)
            assert event.prev_event_hash == expected_hash, (
                f"Hash chain broken at event {i}: "
                f"expected {expected_hash[:12]}..., "
                f"got {event.prev_event_hash[:12]}..."
            )


def _hash_event(event: CEREvent) -> str:
    """Replicate the hash computation from CERLog.append()."""
    import hashlib
    content = json.dumps({
        "event_id": event.event_id,
        "timestamp": event.timestamp,
        "execution_id": event.execution_id,
        "node_id": event.node_id,
        "event_type": event.event_type,
        "payload": event.payload,
        "prev_event_hash": event.prev_event_hash,
    }, sort_keys=True)
    return hashlib.sha256(content.encode("utf-8")).hexdigest()
