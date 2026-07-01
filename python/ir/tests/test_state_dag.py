"""Tests for SM-IR StateDAG and StateVersion."""

import json
import pytest
from dataclasses import FrozenInstanceError
from datetime import datetime, timezone, timedelta

from ir.state_dag import StateDAG, StateVersion, CausalEdgeType
from ir.promotion_receipt import PromotionReceipt


class TestStateVersion:
    """StateVersion creation, immutability, and hashing."""

    def test_create_bare_version(self):
        v = StateVersion(data={"key": "value"})
        assert v.data == {"key": "value"}
        assert v.causal_parents == []
        assert v.source_event_id == ""
        assert v.edge_type == CausalEdgeType.CAUSED_BY
        assert v.hash  # auto-computed

    def test_frozen_no_mutation(self):
        v = StateVersion(data={"x": 1})
        with pytest.raises(FrozenInstanceError):
            v.data = {"x": 2}  # type: ignore[misc]

    def test_hash_is_deterministic(self):
        v1 = StateVersion(
            version_id="fixed-id",
            data={"a": 1},
            causal_parents=["p1"],
            source_event_id="evt-001",
            edge_type=CausalEdgeType.CAUSED_BY,
            timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        v2 = StateVersion(
            version_id="fixed-id",
            data={"a": 1},
            causal_parents=["p1"],
            source_event_id="evt-001",
            edge_type=CausalEdgeType.CAUSED_BY,
            timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        assert v1.hash == v2.hash

    def test_hash_changes_with_data(self):
        v1 = StateVersion(data={"a": 1})
        v2 = StateVersion(data={"a": 2})
        assert v1.hash != v2.hash

    def test_hash_changes_with_parents(self):
        v1 = StateVersion(data={}, causal_parents=["p1"])
        v2 = StateVersion(data={}, causal_parents=["p2"])
        assert v1.hash != v2.hash

    def test_serialization_roundtrip(self):
        v = StateVersion(
            data={"x": 1, "y": 2},
            causal_parents=["parent-1"],
            source_event_id="evt-001",
            edge_type=CausalEdgeType.ENABLES,
        )
        d = v.to_dict()
        v2 = StateVersion.from_dict(d)
        assert v2.version_id == v.version_id
        assert v2.data == v.data
        assert v2.causal_parents == v.causal_parents
        assert v2.source_event_id == v.source_event_id
        assert v2.edge_type == v.edge_type
        assert v2.hash == v.hash

    def test_promotion_receipt_on_version(self):
        receipt = PromotionReceipt(
            from_type="Trace",
            from_id="trace-1",
            to_type="StateVersion",
            to_id="",
            stage="replay_snapshot",
            metadata={"node_id": "node-1"},
        )
        v = StateVersion(promotion_receipt=receipt)
        assert v.promotion_receipt is not None
        assert v.promotion_receipt.from_type == "Trace"
        assert v.promotion_receipt.stage == "replay_snapshot"


class TestStateDAG:
    """StateDAG mutation, query, branching, and serialization."""

    def test_empty_dag(self):
        dag = StateDAG()
        assert dag.version_count == 0
        assert dag.heads == ()
        assert dag.get_head() is None

    def test_single_mutation(self):
        dag = StateDAG()
        v = dag.mutate({"status": "started"}, source_event_id="evt-001")
        assert dag.version_count == 1
        assert dag.heads == (v.version_id,)
        assert dag.get_head().data == {"status": "started"}  # type: ignore[union-attr]

    def test_linear_chain(self):
        dag = StateDAG()
        v1 = dag.mutate({"a": 1}, source_event_id="evt-001")
        v2 = dag.mutate({"b": 2}, source_event_id="evt-002")
        assert dag.version_count == 2
        assert dag.heads == (v2.version_id,)
        # Head has merged data
        assert dag.get_head().data["a"] == 1  # type: ignore[union-attr]
        assert dag.get_head().data["b"] == 2  # type: ignore[union-attr]

    def test_provenance_tracking(self):
        dag = StateDAG()
        v = dag.mutate({"x": 1}, source_event_id="evt-042")
        retrieved = dag.get_version(v.version_id)
        assert retrieved is not None
        assert retrieved.source_event_id == "evt-042"

    def test_causal_parents(self):
        dag = StateDAG()
        v1 = dag.mutate({"step": 1})
        v2 = dag.mutate({"step": 2})

        parents = dag.parents_of(v2.version_id)
        assert len(parents) == 1
        assert parents[0].version_id == v1.version_id

    def test_children_of(self):
        dag = StateDAG()
        v1 = dag.mutate({"step": 1})
        v2 = dag.mutate({"step": 2})

        children = dag.children_of(v1.version_id)
        assert len(children) == 1
        assert children[0].version_id == v2.version_id

    def test_walk_backward(self):
        dag = StateDAG()
        v1 = dag.mutate({"step": 1})
        v2 = dag.mutate({"step": 2})
        v3 = dag.mutate({"step": 3})

        lineage = dag.walk_backward(v3.version_id)
        ids = [v.version_id for v in lineage]
        assert v1.version_id in ids
        assert v2.version_id in ids
        assert v3.version_id in ids

    def test_branching_multiple_heads(self):
        dag = StateDAG()
        v1 = dag.mutate({"base": True})

        # Branch 1 from v1
        v2 = dag.mutate({"branch": "a"}, heads=[v1.version_id])
        # Branch 2 from v1 (different head specification)
        v3 = dag.mutate({"branch": "b"}, heads=[v1.version_id])

        assert dag.version_count == 3
        assert set(dag.heads) == {v2.version_id, v3.version_id}

    def test_explicit_edge_type(self):
        dag = StateDAG()
        v1 = dag.mutate({"step": 1})
        v2 = dag.mutate(
            {"step": 2, "refined": True},
            edge_type=CausalEdgeType.REFINES,
        )
        assert v2.edge_type == CausalEdgeType.REFINES

    def test_invalid_parent_raises(self):
        dag = StateDAG()
        with pytest.raises(ValueError, match="not found"):
            dag.mutate({"x": 1}, heads=["nonexistent-id"])

    def test_serialization_roundtrip(self):
        dag = StateDAG()
        v1 = dag.mutate({"a": 1})
        v2 = dag.mutate({"b": 2})

        d = dag.to_dict()
        dag2 = StateDAG.from_dict(d)

        assert dag2.version_count == 2
        assert set(dag2.heads) == set(dag.heads)
        assert dag2.get_version(v1.version_id).data == {"a": 1}  # type: ignore[union-attr]
        assert dag2.get_version(v2.version_id).data == {"a": 1, "b": 2}  # type: ignore[union-attr]

    def test_promotion_receipt_on_mutate(self):
        dag = StateDAG()
        v = dag.mutate({"step": 1}, source_event_id="evt-001")
        assert v.promotion_receipt is not None
        assert v.promotion_receipt.stage == "replay_snapshot"
        assert v.promotion_receipt.from_type == "ExecutionState|StateVersion"
        assert v.promotion_receipt.to_type == "StateVersion"
        assert v.promotion_receipt.to_id == v.version_id

    def test_get_nonexistent_version(self):
        dag = StateDAG()
        assert dag.get_version("nonexistent") is None
