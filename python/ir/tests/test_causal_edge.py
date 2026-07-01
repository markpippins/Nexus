"""Tests for TEM-IR CausalEdge and CausalGraph."""

import pytest
from datetime import datetime, timezone

from ir.state_dag import CausalEdgeType, StateVersion
from ir.causal_edge import CausalEdge, CausalGraph
from ir.promotion_receipt import PromotionReceipt


class TestCausalEdge:
    """CausalEdge creation, promotion factories, serialization."""

    def test_create_bare_edge(self):
        e = CausalEdge(from_id="A", to_id="B", edge_type=CausalEdgeType.CAUSED_BY)
        assert e.from_id == "A"
        assert e.to_id == "B"
        assert e.edge_type == CausalEdgeType.CAUSED_BY
        assert e.metadata == {}

    def test_edge_with_metadata(self):
        e = CausalEdge(
            from_id="A", to_id="B",
            edge_type=CausalEdgeType.ENABLES,
            metadata={"key": "value"},
        )
        assert e.metadata["key"] == "value"

    def test_from_nbk_edge_creates_receipt(self):
        class FakeEdge:
            from_id = "node-1"
            to_id = "node-2"

        e = CausalEdge.from_nbk_edge(FakeEdge(), CausalEdgeType.CAUSED_BY)
        assert e.from_id == "node-1"
        assert e.to_id == "node-2"
        assert e.promotion_receipt is not None
        assert e.promotion_receipt.stage == "causality_inference"
        assert e.promotion_receipt.from_type == "Edge"

    def test_from_state_versions_creates_receipt(self):
        t = datetime(2026, 1, 1, tzinfo=timezone.utc)
        parent = StateVersion(
            version_id="parent-1", data={"step": 1},
            source_event_id="evt-001", timestamp=t,
        )
        child = StateVersion(
            version_id="child-1", data={"step": 2},
            source_event_id="evt-002", timestamp=t,
            edge_type=CausalEdgeType.REFINES,
        )

        e = CausalEdge.from_state_versions(parent, child)
        assert e.from_id == "parent-1"
        assert e.to_id == "child-1"
        assert e.edge_type == CausalEdgeType.REFINES
        assert e.promotion_receipt is not None
        assert e.promotion_receipt.stage == "temporal_annotation"

    def test_frozen_no_mutation(self):
        from dataclasses import FrozenInstanceError
        e = CausalEdge(from_id="A", to_id="B")
        with pytest.raises(FrozenInstanceError):
            e.from_id = "C"  # type: ignore[misc]

    def test_serialization_roundtrip(self):
        e = CausalEdge(
            from_id="A", to_id="B",
            edge_type=CausalEdgeType.INVALIDATES,
            metadata={"reason": "obsolete"},
        )
        d = e.to_dict()
        e2 = CausalEdge.from_dict(d)
        assert e2.from_id == e.from_id
        assert e2.to_id == e.to_id
        assert e2.edge_type == e.edge_type
        assert e2.metadata == e.metadata


class TestCausalGraph:
    """CausalGraph traversal, ancestry, cycle detection."""

    def test_empty_graph(self):
        g = CausalGraph()
        assert g.edges == ()
        assert g.nodes == set()
        assert g.is_dag()

    def test_add_edge(self):
        g = CausalGraph()
        g.add_edge(CausalEdge(from_id="A", to_id="B"))
        assert len(g.edges) == 1
        assert g.nodes == {"A", "B"}

    def test_outgoing_incoming(self):
        g = CausalGraph()
        g.add_edge(CausalEdge(from_id="A", to_id="B"))
        g.add_edge(CausalEdge(from_id="A", to_id="C"))
        g.add_edge(CausalEdge(from_id="B", to_id="C"))

        assert len(g.outgoing("A")) == 2
        assert len(g.incoming("C")) == 2

    def test_ancestors(self):
        g = CausalGraph()
        g.add_edge(CausalEdge(from_id="A", to_id="B"))
        g.add_edge(CausalEdge(from_id="B", to_id="C"))
        g.add_edge(CausalEdge(from_id="D", to_id="C"))

        assert g.ancestors("C") == {"A", "B", "D"}

    def test_descendants(self):
        g = CausalGraph()
        g.add_edge(CausalEdge(from_id="A", to_id="B"))
        g.add_edge(CausalEdge(from_id="B", to_id="C"))

        assert g.descendants("A") == {"B", "C"}

    def test_is_ancestor(self):
        g = CausalGraph()
        g.add_edge(CausalEdge(from_id="A", to_id="B"))
        g.add_edge(CausalEdge(from_id="B", to_id="C"))

        assert g.is_ancestor("A", "C")
        assert not g.is_ancestor("C", "A")

    def test_is_dag_true(self):
        g = CausalGraph()
        g.add_edge(CausalEdge(from_id="A", to_id="B"))
        g.add_edge(CausalEdge(from_id="B", to_id="C"))
        assert g.is_dag()

    def test_is_dag_false_with_cycle(self):
        g = CausalGraph()
        g.add_edge(CausalEdge(from_id="A", to_id="B"))
        g.add_edge(CausalEdge(from_id="B", to_id="C"))
        g.add_edge(CausalEdge(from_id="C", to_id="A"))  # cycle
        assert not g.is_dag()

    def test_find_path(self):
        g = CausalGraph()
        g.add_edge(CausalEdge(from_id="A", to_id="B"))
        g.add_edge(CausalEdge(from_id="B", to_id="C"))

        path = g.find_path("A", "C")
        assert path is not None
        assert len(path) == 2

    def test_find_path_same_node(self):
        g = CausalGraph()
        assert g.find_path("A", "A") == []

    def test_find_path_none(self):
        g = CausalGraph()
        g.add_edge(CausalEdge(from_id="A", to_id="B"))
        assert g.find_path("B", "A") is None

    def test_serialization_roundtrip(self):
        g = CausalGraph()
        g.add_edge(CausalEdge(from_id="A", to_id="B", edge_type=CausalEdgeType.CAUSED_BY))
        g.add_edge(CausalEdge(from_id="B", to_id="C", edge_type=CausalEdgeType.ENABLES))

        d = g.to_dict()
        g2 = CausalGraph.from_dict(d)
        assert len(g2.edges) == 2
        assert g2.nodes == {"A", "B", "C"}
        assert g2.is_dag()
