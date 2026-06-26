"""Tests for the MEEP core data types."""

import hashlib
import json
from meep.models import (
    IRLResult, IRSelection, WorkNode, WorkEdge, WorkRequestGraph,
    ExecNode, ExecutionGraph, CEREvent, CERLog, ExecutionState,
    ARCHETYPES, REJECT_ARCHETYPE, DEFAULT_ARCHETYPE, MIN_CONFIDENCE_THRESHOLD,
    CEREventType,
)


class TestIRLResult:
    def test_basic_creation(self):
        result = IRLResult(
            probabilities={"EXECUTION": 0.8, "REFLECTION": 0.2},
            raw_input="hello",
        )
        assert result.classifier_version == "heuristic-v1"
        assert sum(result.probabilities.values()) == 1.0

    def test_empty_probabilities(self):
        result = IRLResult(probabilities={}, raw_input="")
        assert len(result.probabilities) == 0


class TestIRSelection:
    def test_basic_creation(self):
        sel = IRSelection(archetype="EXECUTION", confidence=0.8)
        assert sel.archetype == "EXECUTION"
        assert sel.confidence == 0.8
        assert sel.alternatives == []

    def test_with_alternatives(self):
        sel = IRSelection(
            archetype="REVISION",
            confidence=0.6,
            alternatives=["EXECUTION", "REFLECTION"],
        )
        assert "EXECUTION" in sel.alternatives


class TestWorkGraph:
    def test_work_node(self):
        n = WorkNode(id="n1", label="fix-bug", archetype="REVISION")
        assert n.inputs == []
        assert n.outputs == []

    def test_work_edge(self):
        e = WorkEdge(source_id="n1", target_id="n2", relation="depends_on")
        assert e.relation == "depends_on"

    def test_work_request_graph(self):
        g = WorkRequestGraph(
            nodes=[
                WorkNode(id="n1", label="step-1", archetype="EXECUTION"),
                WorkNode(id="n2", label="step-2", archetype="EXECUTION"),
            ],
            edges=[
                WorkEdge(source_id="n1", target_id="n2", relation="depends_on"),
            ],
        )
        assert len(g.nodes) == 2
        assert len(g.edges) == 1


class TestExecGraph:
    def test_exec_node(self):
        n = ExecNode(id="e1", label="run-check", handler="check_handler")
        assert n.config == {}

    def test_execution_graph(self):
        g = ExecutionGraph(
            nodes=[ExecNode(id="e1", label="step", handler="h")],
            edges=[("e1", "e2")],
            topological_order=["e1", "e2"],
            frozen_at="2026-06-20T00:00:00Z",
        )
        assert g.schema_version == "v1"
        assert len(g.topological_order) == 2


class TestCERLog:
    def test_empty_log(self):
        log = CERLog()
        assert len(log) == 0
        assert log.tail_hash == "genesis"

    def test_append_creates_hash_chain(self):
        log = CERLog()
        e1 = CEREvent(
            event_id="evt-1", timestamp="t1", execution_id="ex-1",
            node_id="n1", event_type="NODE_START",
        )
        log.append(e1)
        assert len(log) == 1
        assert log.tail_hash != "genesis"
        assert e1.prev_event_hash == "genesis"

        e2 = CEREvent(
            event_id="evt-2", timestamp="t2", execution_id="ex-1",
            node_id="n1", event_type="NODE_COMPLETE",
        )
        log.append(e2)
        assert len(log) == 2
        # e2.prev_event_hash should be the hash of e1 (after e1 was appended)
        # which is NOT "genesis" (e1 was appended and got a real hash)
        assert e2.prev_event_hash != "genesis"
        # Recompute to verify: hash of e1's serialization
        e1_stored = log._events[0]  # noqa
        e1_json = json.dumps({
            "event_id": e1_stored.event_id,
            "timestamp": e1_stored.timestamp,
            "execution_id": e1_stored.execution_id,
            "node_id": e1_stored.node_id,
            "event_type": e1_stored.event_type,
            "payload": e1_stored.payload,
            "prev_event_hash": e1_stored.prev_event_hash,
        }, sort_keys=True).encode("utf-8")
        assert e2.prev_event_hash == hashlib.sha256(e1_json).hexdigest()

    def test_events_immutable_view(self):
        log = CERLog()
        log.append(CEREvent(
            event_id="evt-1", timestamp="t1", execution_id="ex-1",
            node_id="n1", event_type="NODE_START",
        ))
        events = log.events
        assert len(events) == 1
        # Verify it's a tuple (immutable)
        assert isinstance(events, tuple)

    def test_hash_chain_integrity(self):
        """Verify the hash chain is continuous and each link is valid."""
        log = CERLog()
        events_data = [
            ("evt-1", "NODE_START"),
            ("evt-2", "NODE_COMPLETE"),
            ("evt-3", "NODE_START"),
            ("evt-4", "NODE_COMPLETE"),
        ]
        for i, (eid, etype) in enumerate(events_data):
            log.append(CEREvent(
                event_id=eid, timestamp=f"t{i}", execution_id="ex-1",
                node_id=f"n{i//2}", event_type=etype,  # type: ignore
            ))

        # Walk the chain backwards and verify
        stored = list(log._events)  # noqa
        for i in range(len(stored) - 1, 0, -1):
            expected_prev = hashlib.sha256(json.dumps({
                "event_id": stored[i-1].event_id,
                "timestamp": stored[i-1].timestamp,
                "execution_id": stored[i-1].execution_id,
                "node_id": stored[i-1].node_id,
                "event_type": stored[i-1].event_type,
                "payload": stored[i-1].payload,
                "prev_event_hash": stored[i-1].prev_event_hash,
            }, sort_keys=True).encode("utf-8")).hexdigest()
            assert stored[i].prev_event_hash == expected_prev, \
                f"Hash chain broken at event {i}"


class TestExecutionState:
    def test_empty_state(self):
        s = ExecutionState()
        assert s.node_states == {}
        assert s.completed_nodes == []
        assert not s.is_complete

    def test_with_data(self):
        s = ExecutionState(
            node_states={"n1": "COMPLETED", "n2": "PENDING"},
            completed_nodes=["n1"],
            event_count=2,
            is_complete=False,
        )
        assert s.node_states["n1"] == "COMPLETED"
        assert s.event_count == 2


class TestArchetypes:
    def test_archetype_set_is_frozen(self):
        assert "CONSTRUCTION" in ARCHETYPES
        assert "EXECUTION" in ARCHETYPES
        assert "REJECT" in ARCHETYPES
        assert len(ARCHETYPES) == 11  # 9 original + DEFAULT + REJECT

    def test_constants(self):
        assert REJECT_ARCHETYPE == "REJECT"
        assert DEFAULT_ARCHETYPE == "DEFAULT"
        assert MIN_CONFIDENCE_THRESHOLD == 0.4
