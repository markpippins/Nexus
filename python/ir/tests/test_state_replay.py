"""Tests for StateReplayEngine — CERLog → StateDAG bridge."""

import pytest
from datetime import datetime, timezone

from ir.state_dag import StateDAG, CausalEdgeType
from ir.state_replay import StateReplayEngine


class FakeCEREvent:
    """Duck-typed CEREvent for testing without MEEP import."""

    def __init__(
        self,
        event_id: str,
        event_type: str,
        node_id: str = "",
        payload: dict | None = None,
        timestamp: str | None = None,
    ):
        self.event_id = event_id
        self.event_type = event_type
        self.node_id = node_id
        self.payload = payload or {}
        self.timestamp = timestamp or datetime.now(timezone.utc).isoformat()
        self.execution_id = "exec-001"
        self.prev_event_hash = ""


class TestStateReplayEngine:
    """Replay CERLog events into StateDAG."""

    def test_empty_events_produces_empty_dag(self):
        engine = StateReplayEngine()
        dag = engine.replay([])
        assert dag.version_count == 0

    def test_single_node_start_complete(self):
        events = [
            FakeCEREvent("evt-001", "NODE_START", node_id="n1", payload={"handler": "build"}),
            FakeCEREvent("evt-002", "NODE_COMPLETE", node_id="n1", payload={"result": "ok"}),
        ]
        engine = StateReplayEngine()
        dag = engine.replay(events)

        assert dag.version_count == 2
        head = dag.get_head()
        assert "node:n1:state" in head.data  # type: ignore[union-attr]
        assert "node:n1:result" in head.data  # type: ignore[union-attr]

    def test_provenance_links(self):
        events = [
            FakeCEREvent("evt-042", "NODE_START", node_id="n1"),
            FakeCEREvent("evt-043", "NODE_COMPLETE", node_id="n1"),
        ]
        engine = StateReplayEngine()
        dag = engine.replay(events)

        for event in events:
            versions = [
                v for v in dag._versions.values()
                if v.source_event_id == event.event_id
            ]
            assert len(versions) == 1, f"Missing version for {event.event_id}"

    def test_node_fail_maps_to_invalidates(self):
        events = [
            FakeCEREvent("evt-001", "NODE_START", node_id="n1"),
            FakeCEREvent("evt-002", "NODE_FAIL", node_id="n1", payload={"error": "crash"}),
        ]
        engine = StateReplayEngine()
        dag = engine.replay(events)

        head = dag.get_head()
        assert head is not None
        assert head.edge_type == CausalEdgeType.INVALIDATES
        assert "node:n1:error" in head.data

    def test_node_skip_maps_to_invalidates(self):
        events = [
            FakeCEREvent("evt-001", "NODE_SKIP", node_id="n1", payload={"reason": "unchanged"}),
        ]
        engine = StateReplayEngine()
        dag = engine.replay(events)

        head = dag.get_head()
        assert head.edge_type == CausalEdgeType.INVALIDATES
        assert head.data.get("node:n1:state") == "SKIPPED"

    def test_multiple_nodes(self):
        events = [
            FakeCEREvent("e1", "NODE_START", node_id="a"),
            FakeCEREvent("e2", "NODE_COMPLETE", node_id="a", payload={"result": "a-ok"}),
            FakeCEREvent("e3", "NODE_START", node_id="b"),
            FakeCEREvent("e4", "NODE_COMPLETE", node_id="b", payload={"result": "b-ok"}),
        ]
        engine = StateReplayEngine()
        dag = engine.replay(events)

        head = dag.get_head()
        assert head.data.get("node:a:state") == "COMPLETED"
        assert head.data.get("node:b:state") == "COMPLETED"

    def test_deterministic_replay(self):
        events = [
            FakeCEREvent("e1", "NODE_START", node_id="n1"),
            FakeCEREvent("e2", "NODE_COMPLETE", node_id="n1", payload={"result": "ok"}),
        ]
        dag1 = StateReplayEngine().replay(events)
        dag2 = StateReplayEngine().replay(events)

        assert dag1.version_count == dag2.version_count

        h1 = dag1.get_head()
        h2 = dag2.get_head()
        assert h1 is not None and h2 is not None

        # Data and edge types must match (same replay semantics),
        # but version_ids are random UUIDs, so exact hash equality
        # is not guaranteed.  Compare structure instead.
        assert h1.data == h2.data
        assert h1.edge_type == h2.edge_type
        assert h1.source_event_id == h2.source_event_id
        assert len(h1.causal_parents) == len(h2.causal_parents)
