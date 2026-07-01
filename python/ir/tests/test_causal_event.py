"""Tests for TEM-IR CausalEvent and TemporalAnnotator."""

import pytest
from datetime import datetime, timezone

from ir.state_dag import StateDAG, CausalEdgeType
from ir.causal_event import CausalEvent, _next_epoch
from ir.causal_edge import CausalEdge
from ir.time_model import TimeModel
from ir.temporal_annotator import TemporalAnnotator


class FakeCEREvent:
    """Duck-typed CEREvent for testing CausalEvent promotion."""

    def __init__(
        self,
        event_id: str,
        event_type: str = "NODE_START",
        node_id: str = "n1",
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


class TestCausalEvent:
    """CausalEvent creation, promotion from CEREvent."""

    def test_create_bare_event(self):
        ce = CausalEvent(event_id="evt-001", event_type="NODE_START")
        assert ce.event_id == "evt-001"
        assert ce.event_type == "NODE_START"
        assert ce.causal_parents == []

    def test_from_cer_event_no_parents(self):
        cer = FakeCEREvent("evt-001", "NODE_START", node_id="n1")
        ce = CausalEvent.from_cer_event(cer)

        assert ce.event_id == "evt-001"
        assert ce.causal_parents == []
        assert ce.time_model.causal_epoch == 1  # first event = epoch 1
        assert ce.time_model.lease_time is None
        assert ce.promotion_receipt is not None
        assert ce.promotion_receipt.stage == "from_cer_event"

    def test_from_cer_event_with_parents(self):
        cer1 = FakeCEREvent("evt-001", "NODE_START")
        ce1 = CausalEvent.from_cer_event(cer1)

        parent_edge = CausalEdge(
            from_id="evt-001", to_id="evt-002",
            edge_type=CausalEdgeType.CAUSED_BY,
            metadata={"causal_epoch": 1},
        )
        cer2 = FakeCEREvent("evt-002", "NODE_COMPLETE")
        ce2 = CausalEvent.from_cer_event(cer2, parents=[parent_edge])

        assert ce2.causal_parents == [parent_edge]
        assert ce2.time_model.causal_epoch == 2  # max(1) + 1

    def test_next_epoch_empty(self):
        assert _next_epoch([]) == 1

    def test_next_epoch_with_parents(self):
        parents = [
            CausalEdge(from_id="A", to_id="B", metadata={"causal_epoch": 5}),
            CausalEdge(from_id="C", to_id="B", metadata={"causal_epoch": 3}),
        ]
        assert _next_epoch(parents) == 6

    def test_frozen_no_mutation(self):
        from dataclasses import FrozenInstanceError
        ce = CausalEvent(event_id="evt-001")
        with pytest.raises(FrozenInstanceError):
            ce.event_id = "evt-002"  # type: ignore[misc]

    def test_serialization_roundtrip(self):
        cer = FakeCEREvent("evt-001", "NODE_START", payload={"result": "ok"})
        ce = CausalEvent.from_cer_event(cer)
        d = ce.to_dict()
        ce2 = CausalEvent.from_dict(d)
        assert ce2.event_id == ce.event_id
        assert ce2.time_model.causal_epoch == ce.time_model.causal_epoch


class TestTemporalAnnotator:
    """TemporalAnnotator enriches StateDAG → CausalGraph."""

    def test_empty_dag(self):
        dag = StateDAG()
        graph = TemporalAnnotator().annotate(dag)
        assert len(graph.edges) == 0

    def test_single_version(self):
        dag = StateDAG()
        dag.mutate({"step": 1}, source_event_id="evt-001")
        graph = TemporalAnnotator().annotate(dag)

        assert len(graph.edges) == 0  # single version has no parents

    def test_linear_chain(self):
        dag = StateDAG()
        v1 = dag.mutate({"step": 1}, source_event_id="evt-001")
        v2 = dag.mutate({"step": 2}, source_event_id="evt-002")

        graph = TemporalAnnotator().annotate(dag)

        assert len(graph.edges) == 1  # one parent→child edge
        assert graph.is_dag()

    def test_branching(self):
        dag = StateDAG()
        v1 = dag.mutate({"base": True}, source_event_id="e1")
        v2a = dag.mutate({"branch": "a"}, heads=[v1.version_id], source_event_id="e2a")
        v2b = dag.mutate({"branch": "b"}, heads=[v1.version_id], source_event_id="e2b")

        graph = TemporalAnnotator().annotate(dag)
        assert len(graph.edges) == 2  # two branches from same parent
        assert graph.is_dag()

    def test_preserves_edge_types(self):
        dag = StateDAG()
        dag.mutate({"step": 1}, source_event_id="e1")
        dag.mutate({"step": 2}, source_event_id="e2",
                   edge_type=CausalEdgeType.REFINES)

        graph = TemporalAnnotator().annotate(dag)
        assert len(graph.edges) == 1
        edge = graph.edges[0]
        assert edge.edge_type == CausalEdgeType.REFINES

    def test_does_not_modify_dag(self):
        dag = StateDAG()
        dag.mutate({"step": 1})
        dag.mutate({"step": 2})

        version_count_before = dag.version_count
        graph = TemporalAnnotator().annotate(dag)

        assert dag.version_count == version_count_before  # unchanged
        assert len(graph.edges) == 1  # enrichment produced separately
