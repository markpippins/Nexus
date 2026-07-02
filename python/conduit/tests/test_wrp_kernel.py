"""
Comprehensive unit tests for the WRP Kernel Reduce Function (plan 1023).

Tests cover all 5 modules:
  - delta.py      : KernelDelta creation and validation
  - identity.py   : IdentityEngine node_id → identity_id resolution
  - graph.py      : GraphIndex identity-based typed edges
  - lineage.py    : LineageEngine causal event recording
  - snapshot.py   : KernelSnapshot + SnapshotStore KSRA
  - engine.py     : KernelEngine 5-step reduce pipeline + reconstruction

Run with:
    python -m pytest tests/test_wrp_kernel.py -v
or:
    python tests/test_wrp_kernel.py
"""

import json
import sys
import os

# Ensure the conduit package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

# ── Module imports ────────────────────────────────────────────────────

from wrp_kernel.delta import KernelDelta, KernelDeltaBatch
from wrp_kernel.identity import IdentityEngine, Identity
from wrp_kernel.graph import GraphIndex, GraphEdge
from wrp_kernel.lineage import LineageEngine, LineageEvent
from wrp_kernel.snapshot import KernelSnapshot, SnapshotStore
from wrp_kernel.engine import (
    KernelEngine,
    KernelState,
    KernelResult,
    KernelError,
    reconstruct_kernel_state,
    is_valid_transition,
    WRP_ADJACENCY_MATRIX,
)


# ══════════════════════════════════════════════════════════════════════
# Section 1: KernelDelta tests
# ══════════════════════════════════════════════════════════════════════

class TestKernelDelta:
    def test_create_delta(self):
        """A basic KernelDelta can be created."""
        d = KernelDelta(delta_id="delta_test_001", batch_id="batch_01")
        assert d.delta_id == "delta_test_001"
        assert d.batch_id == "batch_01"
        assert d.receipts == []
        assert d.affected_plans == set()
        assert d.version == 0

    def test_delta_with_receipts(self):
        """A KernelDelta can carry receipts and plan ids."""
        d = KernelDelta(
            delta_id="delta_test_002",
            batch_id="batch_01",
            receipts=[{"id": "rec_001", "type": "PLAN_CREATE"}],
            affected_plans={"0050"},
            version=1,
        )
        assert len(d.receipts) == 1
        assert "0050" in d.affected_plans
        assert d.version == 1

    def test_delta_empty_delta_id_rejected(self):
        """delta_id is required, must not be empty."""
        with pytest.raises(ValueError, match="delta_id is required"):
            KernelDelta(delta_id="", batch_id="batch_01")

    def test_delta_negative_version_rejected(self):
        """Version must be >= 0."""
        with pytest.raises(ValueError, match="version must be >= 0"):
            KernelDelta(delta_id="delta_neg", batch_id="batch_01", version=-1)

    def test_delta_frozen(self):
        """KernelDelta is frozen (immutable)."""
        d = KernelDelta(delta_id="delta_frozen", batch_id="batch_01")
        with pytest.raises(Exception):
            d.delta_id = "changed"  # type: ignore

    def test_delta_invalidated_plans(self):
        """KernelDelta supports invalidated_plans field."""
        d = KernelDelta(
            delta_id="delta_inv",
            batch_id="batch_01",
            invalidated_plans={"0050", "0051"},
        )
        assert "0050" in d.invalidated_plans
        assert "0051" in d.invalidated_plans
        assert len(d.invalidated_plans) == 2


class TestKernelDeltaBatch:
    def test_create_batch(self):
        """A KernelDeltaBatch groups multiple deltas."""
        d1 = KernelDelta(delta_id="d1", batch_id="b1")
        d2 = KernelDelta(delta_id="d2", batch_id="b1")
        batch = KernelDeltaBatch(batch_id="b1", deltas=[d1, d2])
        assert batch.batch_id == "b1"
        assert len(batch.deltas) == 2

    def test_total_receipts(self):
        """total_receipts() sums receipts across all deltas."""
        d1 = KernelDelta(
            delta_id="d1", batch_id="b1",
            receipts=[{"id": "r1"}, {"id": "r2"}],
        )
        d2 = KernelDelta(
            delta_id="d2", batch_id="b1",
            receipts=[{"id": "r3"}],
        )
        batch = KernelDeltaBatch(batch_id="b1", deltas=[d1, d2])
        assert batch.total_receipts() == 3

    def test_batch_with_source_hash(self):
        """A batch can carry an optional source_hash."""
        batch = KernelDeltaBatch(
            batch_id="b1", source_hash="abc123",
        )
        assert batch.source_hash == "abc123"

    def test_empty_batch(self):
        """An empty batch is valid."""
        batch = KernelDeltaBatch(batch_id="b_empty")
        assert batch.total_receipts() == 0


# ══════════════════════════════════════════════════════════════════════
# Section 2: IdentityEngine tests
# ══════════════════════════════════════════════════════════════════════

class TestIdentityEngine:
    def test_resolve_new_node(self):
        """Resolving a new node_id creates a fresh identity."""
        engine = IdentityEngine()
        iid = engine.resolve("plan_0050")
        assert iid == "iden::plan_0050"

    def test_resolve_same_node_twice(self):
        """Resolving the same node_id twice returns the same identity_id."""
        engine = IdentityEngine()
        iid1 = engine.resolve("plan_0050")
        iid2 = engine.resolve("plan_0050")
        assert iid1 == iid2

    def test_resolve_different_nodes(self):
        """Different node_ids get different identities."""
        engine = IdentityEngine()
        iid1 = engine.resolve("plan_0050")
        iid2 = engine.resolve("plan_0051")
        assert iid1 != iid2

    def test_get_identity_by_id(self):
        """get_identity() returns the Identity object for an identity_id."""
        engine = IdentityEngine()
        iid = engine.resolve("plan_0050")
        ident = engine.get_identity(iid)
        assert ident is not None
        assert ident.id == iid
        assert "plan_0050" in ident.aliases

    def test_get_identity_for_node(self):
        """get_identity_for_node() returns the Identity for a node_id."""
        engine = IdentityEngine()
        engine.resolve("plan_0050")
        ident = engine.get_identity_for_node("plan_0050")
        assert ident is not None
        assert ident.id == "iden::plan_0050"

    def test_get_identity_for_unknown_node(self):
        """get_identity_for_node() returns None for unknown node."""
        engine = IdentityEngine()
        assert engine.get_identity_for_node("nonexistent") is None

    def test_known_count(self):
        """known_count() returns the number of unique identities."""
        engine = IdentityEngine()
        assert engine.known_count() == 0
        engine.resolve("plan_0050")
        assert engine.known_count() == 1
        engine.resolve("plan_0051")
        assert engine.known_count() == 2
        engine.resolve("plan_0050")  # duplicate, count should not change
        assert engine.known_count() == 2

    def test_reset(self):
        """reset() clears all identity state."""
        engine = IdentityEngine()
        engine.resolve("plan_0050")
        assert engine.known_count() == 1
        engine.reset()
        assert engine.known_count() == 0

    def test_identity_add_alias(self):
        """An Identity can accumulate multiple aliases."""
        ident = Identity(id="iden::plan_0050", aliases={"plan_0050"})
        ident.add_alias("plan_0050_v2")
        assert "plan_0050_v2" in ident.aliases
        assert len(ident.aliases) == 2


# ══════════════════════════════════════════════════════════════════════
# Section 3: GraphIndex tests
# ══════════════════════════════════════════════════════════════════════

class TestGraphIndex:
    def test_add_edge(self):
        """A typed edge can be added to the graph."""
        g = GraphIndex()
        edge = GraphEdge(source="iden::a", target="iden::b", relation="wrp:depends_on")
        g.add(edge)
        assert g.edge_count() == 1

    def test_edges_from(self):
        """edges_from() returns outgoing edges for a source."""
        g = GraphIndex()
        g.add(GraphEdge("iden::a", "iden::b", "wrp:depends_on"))
        g.add(GraphEdge("iden::a", "iden::c", "wrp:impacts"))
        edges = g.edges_from("iden::a")
        assert len(edges) == 2

    def test_edges_to(self):
        """edges_to() returns incoming edges for a target."""
        g = GraphIndex()
        g.add(GraphEdge("iden::a", "iden::z", "wrp:depends_on"))
        g.add(GraphEdge("iden::b", "iden::z", "wrp:impacts"))
        edges = g.edges_to("iden::z")
        assert len(edges) == 2

    def test_deduplication(self):
        """Adding the same edge twice is idempotent."""
        g = GraphIndex()
        edge = GraphEdge("iden::a", "iden::b", "wrp:depends_on")
        g.add(edge)
        g.add(edge)
        assert g.edge_count() == 1

    def test_traverse_1_hop(self):
        """BFS traversal finds direct neighbors."""
        g = GraphIndex()
        g.add(GraphEdge("iden::a", "iden::b", "wrp:depends_on"))
        g.add(GraphEdge("iden::b", "iden::c", "wrp:depends_on"))
        results = g.traverse("iden::a", depth=1)
        assert len(results) == 1
        assert results[0].target == "iden::b"

    def test_traverse_2_hop(self):
        """BFS traversal with depth=2 reaches two layers."""
        g = GraphIndex()
        g.add(GraphEdge("iden::a", "iden::b", "wrp:depends_on"))
        g.add(GraphEdge("iden::b", "iden::c", "wrp:depends_on"))
        results = g.traverse("iden::a", depth=2)
        assert len(results) == 2
        targets = {e.target for e in results}
        assert "iden::b" in targets
        assert "iden::c" in targets

    def test_traverse_filtered(self):
        """Traversal can filter by relation type."""
        g = GraphIndex()
        g.add(GraphEdge("iden::a", "iden::b", "wrp:depends_on"))
        g.add(GraphEdge("iden::a", "iden::c", "wrp:impacts"))
        results = g.traverse("iden::a", relation="wrp:impacts", depth=1)
        assert len(results) == 1
        assert results[0].target == "iden::c"

    def test_traverse_no_edges(self):
        """Traversal from a node with no edges returns empty."""
        g = GraphIndex()
        results = g.traverse("iden::lonely", depth=3)
        assert results == []

    def test_remove_edge(self):
        """An edge can be removed."""
        g = GraphIndex()
        edge = GraphEdge("iden::a", "iden::b", "wrp:depends_on")
        g.add(edge)
        assert g.edge_count() == 1
        g.remove(edge)
        assert g.edge_count() == 0

    def test_node_count(self):
        """node_count returns unique source nodes."""
        g = GraphIndex()
        g.add(GraphEdge("iden::a", "iden::b", "wrp:depends_on"))
        g.add(GraphEdge("iden::a", "iden::c", "wrp:depends_on"))
        g.add(GraphEdge("iden::b", "iden::c", "wrp:depends_on"))
        assert g.node_count() == 2  # a and b

    def test_all_edges(self):
        """all_edges() returns deduplicated edge list."""
        g = GraphIndex()
        g.add(GraphEdge("iden::a", "iden::b", "wrp:depends_on"))
        g.add(GraphEdge("iden::a", "iden::b", "wrp:depends_on"))  # duplicate
        assert len(g.all_edges()) == 1

    def test_reset(self):
        """reset() clears all graph state."""
        g = GraphIndex()
        g.add(GraphEdge("iden::a", "iden::b", "wrp:depends_on"))
        assert g.edge_count() == 1
        g.reset()
        assert g.edge_count() == 0

    def test_edge_metadata(self):
        """A GraphEdge can carry metadata."""
        edge = GraphEdge(
            "iden::a", "iden::b", "wrp:depends_on",
            metadata={"type": "explicit"},
        )
        assert edge.metadata == {"type": "explicit"}


# ══════════════════════════════════════════════════════════════════════
# Section 4: LineageEngine tests
# ══════════════════════════════════════════════════════════════════════

class TestLineageEngine:
    def test_record_event(self):
        """A lineage event can be recorded."""
        le = LineageEngine()
        event = LineageEvent(
            version=1, delta_id="delta_001", step="materialize",
        )
        le.record(event)
        assert le.event_count() == 1

    def test_record_from_delta(self):
        """record_from_delta() is a convenience for creating events."""
        le = LineageEngine()
        event = le.record_from_delta(
            version=1, delta_id="delta_001", step="reduce",
            event_type="apply", affected_plans=["0050"],
        )
        assert event.version == 1
        assert event.delta_id == "delta_001"
        assert event.step == "reduce"
        assert "0050" in event.affected_plans

    def test_events_since(self):
        """events_since() returns events after a given version."""
        le = LineageEngine()
        le.record(LineageEvent(version=1, delta_id="d1", step="a"))
        le.record(LineageEvent(version=2, delta_id="d2", step="b"))
        le.record(LineageEvent(version=3, delta_id="d3", step="c"))
        events = le.events_since(1)
        assert len(events) == 2
        assert events[0].version == 2
        assert events[1].version == 3

    def test_events_for_delta(self):
        """events_for_delta() gets events for a specific delta_id."""
        le = LineageEngine()
        le.record(LineageEvent(version=1, delta_id="delta_001", step="a"))
        le.record(LineageEvent(version=2, delta_id="delta_001", step="b"))
        le.record(LineageEvent(version=3, delta_id="delta_002", step="c"))
        events = le.events_for_delta("delta_001")
        assert len(events) == 2

    def test_last_event_empty(self):
        """last_event() returns None on empty engine."""
        le = LineageEngine()
        assert le.last_event() is None

    def test_last_event(self):
        """last_event() returns the most recent event."""
        le = LineageEngine()
        le.record(LineageEvent(version=1, delta_id="d1", step="a"))
        le.record(LineageEvent(version=2, delta_id="d2", step="b"))
        last = le.last_event()
        assert last is not None
        assert last.version == 2

    def test_all_events(self):
        """all_events() returns the full event list."""
        le = LineageEngine()
        le.record(LineageEvent(version=1, delta_id="d1", step="a"))
        le.record(LineageEvent(version=2, delta_id="d2", step="b"))
        events = le.all_events()
        assert len(events) == 2

    def test_reset(self):
        """reset() clears all lineage events."""
        le = LineageEngine()
        le.record(LineageEvent(version=1, delta_id="d1", step="a"))
        le.reset()
        assert le.event_count() == 0


# ══════════════════════════════════════════════════════════════════════
# Section 5: SnapshotStore tests
# ══════════════════════════════════════════════════════════════════════

class TestSnapshotStore:
    def test_put_and_get(self):
        """A snapshot can be stored and retrieved by version."""
        store = SnapshotStore()
        snap = KernelSnapshot(version=5, state={"version": 5})
        store.put(snap)
        retrieved = store.get(5)
        assert retrieved is not None
        assert retrieved.version == 5

    def test_get_nonexistent(self):
        """get() returns None for missing version."""
        store = SnapshotStore()
        assert store.get(42) is None

    def test_find_nearest_exact(self):
        """find_nearest() returns exact match when available."""
        store = SnapshotStore()
        store.put(KernelSnapshot(version=5, state={}))
        snap = store.find_nearest(5)
        assert snap is not None
        assert snap.version == 5

    def test_find_nearest_lower_version(self):
        """find_nearest() returns closest lower version."""
        store = SnapshotStore()
        store.put(KernelSnapshot(version=10, state={}))
        store.put(KernelSnapshot(version=20, state={}))
        snap = store.find_nearest(15)
        assert snap is not None
        assert snap.version == 10  # 10 <= 15, 20 > 15

    def test_find_nearest_no_snapshot(self):
        """find_nearest() returns None when no snapshot ≤ target."""
        store = SnapshotStore()
        snap = store.find_nearest(5)
        assert snap is None

    def test_find_nearest_returns_max(self):
        """find_nearest() returns the max version ≤ target."""
        store = SnapshotStore()
        store.put(KernelSnapshot(version=5, state={}))
        store.put(KernelSnapshot(version=10, state={}))
        store.put(KernelSnapshot(version=15, state={}))
        snap = store.find_nearest(12)
        assert snap is not None
        assert snap.version == 10  # 10 ≤ 12, and is the max ≤ 12

    def test_latest(self):
        """latest() returns the highest-version snapshot."""
        store = SnapshotStore()
        store.put(KernelSnapshot(version=5, state={}))
        store.put(KernelSnapshot(version=15, state={}))
        store.put(KernelSnapshot(version=10, state={}))
        latest = store.latest()
        assert latest is not None
        assert latest.version == 15

    def test_latest_empty(self):
        """latest() returns None on empty store."""
        store = SnapshotStore()
        assert store.latest() is None

    def test_all_versions(self):
        """all_versions() returns sorted version list."""
        store = SnapshotStore()
        store.put(KernelSnapshot(version=10, state={}))
        store.put(KernelSnapshot(version=5, state={}))
        store.put(KernelSnapshot(version=15, state={}))
        assert store.all_versions() == [5, 10, 15]

    def test_count(self):
        """count() returns the number of snapshots."""
        store = SnapshotStore()
        assert store.count() == 0
        store.put(KernelSnapshot(version=1, state={}))
        assert store.count() == 1

    def test_reset(self):
        """reset() clears all snapshots."""
        store = SnapshotStore()
        store.put(KernelSnapshot(version=1, state={}))
        store.reset()
        assert store.count() == 0

    def test_snapshot_with_hashes(self):
        """KernelSnapshot can carry identity_hash and graph_hash."""
        snap = KernelSnapshot(
            version=42,
            state={"plans": ["0050"]},
            identity_hash="abc123",
            graph_hash="def456",
            lineage_cursor=41,
        )
        assert snap.identity_hash == "abc123"
        assert snap.graph_hash == "def456"
        assert snap.lineage_cursor == 41


# ══════════════════════════════════════════════════════════════════════
# Section 6: KernelState tests
# ══════════════════════════════════════════════════════════════════════

class TestKernelState:
    def test_initial_state(self):
        """A fresh KernelState has version 0 and empty collections."""
        state = KernelState()
        assert state.version == 0
        assert state.receipts == {}
        assert state.plans == set()
        assert state.transitions == []
        assert state.graph.edge_count() == 0
        assert state.identity.known_count() == 0
        assert state.lineage.event_count() == 0

    def test_serialize_round_trip(self):
        """to_dict() → from_dict() round trip preserves state."""
        original = KernelState()
        original.version = 42
        original.receipts = {"rec_001": {"id": "rec_001", "type": "PLAN_CREATE"}}
        original.plans = {"0050", "0051"}
        original.transitions = [{"from": "CREATED", "to": "PLANNING"}]
        original.graph.add(GraphEdge("iden::a", "iden::b", "wrp:depends_on"))
        original.identity.resolve("plan_0050")
        original.lineage.record_from_delta(
            version=42, delta_id="delta_001", step="reduce",
        )

        data = original.to_dict()
        restored = KernelState.from_dict(data)

        assert restored.version == 42
        assert "rec_001" in restored.receipts
        assert "0050" in restored.plans
        assert restored.graph.edge_count() == 1
        assert restored.identity.known_count() == 1
        assert restored.lineage.event_count() == 1

    def test_serialize_empty_state(self):
        """Empty state round-trips correctly."""
        original = KernelState()
        data = original.to_dict()
        restored = KernelState.from_dict(data)
        assert restored.version == 0
        assert restored.receipts == {}
        assert restored.plans == set()

    def test_serialize_with_metadata(self):
        """Metadata field survives round-trip."""
        original = KernelState(metadata={"source": "rover", "batch": "b1"})
        data = original.to_dict()
        restored = KernelState.from_dict(data)
        assert restored.metadata == {"source": "rover", "batch": "b1"}


# ══════════════════════════════════════════════════════════════════════
# Section 7: Engine tests — Utility functions
# ══════════════════════════════════════════════════════════════════════

class TestEngineUtilities:
    def test_valid_transition_forward(self):
        """A valid forward transition is accepted."""
        assert is_valid_transition("CREATED", "INTAKE") is True
        assert is_valid_transition("INTAKE", "PLANNING") is True
        assert is_valid_transition("PLANNING", "CRITIQUE") is True
        assert is_valid_transition("CRITIQUE", "SPECIFICATION") is True
        assert is_valid_transition("SPECIFICATION", "APPROVED") is True
        assert is_valid_transition("APPROVED", "QUEUED") is True
        assert is_valid_transition("QUEUED", "EXECUTING") is True
        assert is_valid_transition("EXECUTING", "COMPLETED") is True
        assert is_valid_transition("COMPLETED", "ARCHIVED") is True

    def test_valid_transition_fail(self):
        """Any non-terminal state can transition to FAILED.
        ARCHIVED and COMPLETED are terminal and cannot transition."""
        terminal_states = {"ARCHIVED", "COMPLETED", "FAILED"}
        for state in WRP_ADJACENCY_MATRIX:
            if state not in terminal_states:
                assert is_valid_transition(state, "FAILED") is True

    def test_invalid_transition(self):
        """A backwards transition is rejected."""
        assert is_valid_transition("COMPLETED", "EXECUTING") is False
        assert is_valid_transition("ARCHIVED", "COMPLETED") is False

    def test_transition_to_self(self):
        """Self-transitions are generally invalid."""
        assert is_valid_transition("PLANNING", "PLANNING") is False

    def test_unknown_state(self):
        """An unknown source state has no transitions."""
        assert is_valid_transition("UNKNOWN_STATE", "CREATED") is False


# ══════════════════════════════════════════════════════════════════════
# Section 8: Engine tests — KernelEngine 5-step reduce pipeline
# ══════════════════════════════════════════════════════════════════════

class TestKernelEngineReduce:
    def test_reduce_empty_delta(self):
        """Reducing an empty delta succeeds with version bump."""
        engine = KernelEngine()
        delta = KernelDelta(delta_id="delta_001", batch_id="batch_01")
        result = engine.reduce(delta)
        assert result.is_ok
        assert result.value is not None
        assert result.value.version == 1

    def test_reduce_with_receipt(self):
        """A delta with one receipt is materialized."""
        engine = KernelEngine()
        delta = KernelDelta(
            delta_id="delta_002",
            batch_id="batch_01",
            receipts=[{"id": "rec_001", "plan_id": "0050", "type": "PLAN_CREATE"}],
            affected_plans={"0050"},
        )
        result = engine.reduce(delta)
        assert result.is_ok
        assert result.value is not None
        assert "rec_001" in result.value.receipts
        assert "0050" in result.value.plans

    def test_reduce_duplicate_receipt(self):
        """Duplicate receipt_id in same delta is rejected."""
        engine = KernelEngine()
        delta = KernelDelta(
            delta_id="delta_003",
            batch_id="batch_01",
            receipts=[
                {"id": "rec_001", "type": "PLAN_CREATE"},
                {"id": "rec_001", "type": "IMPLEMENTATION"},  # same id
            ],
            affected_plans={"0050"},
        )
        result = engine.reduce(delta)
        assert result.is_error
        assert result.error is not None
        assert result.error.type == "INVARIANT_VIOLATION"
        assert "Duplicate" in result.error.message

    def test_reduce_missing_receipt_id(self):
        """A receipt without an id is rejected."""
        engine = KernelEngine()
        delta = KernelDelta(
            delta_id="delta_no_id",
            batch_id="batch_01",
            receipts=[{"type": "PLAN_CREATE"}],
        )
        result = engine.reduce(delta)
        assert result.is_error
        assert result.error is not None
        assert result.error.type == "VALIDATION_ERROR"

    def test_reduce_tracks_plans(self):
        """Multiple receipts track multiple plan IDs."""
        engine = KernelEngine()
        delta = KernelDelta(
            delta_id="delta_multi",
            batch_id="batch_01",
            receipts=[
                {"id": "rec_a", "plan_id": "0050", "type": "PLAN_CREATE"},
                {"id": "rec_b", "plan_id": "0051", "type": "PLAN_CREATE"},
            ],
            affected_plans={"0050", "0051"},
        )
        result = engine.reduce(delta)
        assert result.is_ok
        assert "0050" in result.value.plans
        assert "0051" in result.value.plans

    def test_reduce_increments_version(self):
        """Each reduce increments the version."""
        engine = KernelEngine()
        d1 = KernelDelta(delta_id="d1", batch_id="b1")
        d2 = KernelDelta(delta_id="d2", batch_id="b1")
        d3 = KernelDelta(delta_id="d3", batch_id="b1")

        r1 = engine.reduce(d1)
        assert r1.is_ok and r1.value.version == 1

        r2 = engine.reduce(d2)
        assert r2.is_ok and r2.value.version == 2

        r3 = engine.reduce(d3)
        assert r3.is_ok and r3.value.version == 3

    def test_reduce_identity_resolution(self):
        """Recipes with node_id get identity resolution."""
        engine = KernelEngine()
        delta = KernelDelta(
            delta_id="delta_id_resolve",
            batch_id="batch_01",
            receipts=[{"id": "rec_001", "plan_id": "0050",
                       "node_id": "plan_0050", "type": "PLAN_CREATE"}],
            affected_plans={"0050"},
        )
        result = engine.reduce(delta)
        assert result.is_ok
        receipt = result.value.receipts.get("rec_001")
        assert receipt is not None
        assert "_identity_id" in receipt
        assert receipt["_identity_id"] == "iden::plan_0050"
        assert result.value.identity.known_count() == 1

    def test_reduce_graph_edges_from_dependencies(self):
        """Dependencies in receipts create graph edges."""
        engine = KernelEngine()
        delta = KernelDelta(
            delta_id="delta_graph_dep",
            batch_id="batch_01",
            receipts=[{
                "id": "rec_001",
                "plan_id": "0050",
                "type": "PLAN_CREATE",
                "node_id": "plan_0050",
                "dependencies": ["0051", "0052"],
                "files_affected": [],
            }],
            affected_plans={"0050"},
        )
        result = engine.reduce(delta)
        assert result.is_ok
        # Should have created 2 dependency edges (0050→0051, 0050→0052)
        edges = result.value.graph.edges_from("iden::plan_0050")
        assert len(edges) >= 2
        relations = {e.relation for e in edges}
        assert "wrp:depends_on" in relations

    def test_reduce_graph_edges_from_files(self):
        """files_affected create wrp:impacts_system edges."""
        engine = KernelEngine()
        delta = KernelDelta(
            delta_id="delta_graph_files",
            batch_id="batch_01",
            receipts=[{
                "id": "rec_001",
                "plan_id": "0050",
                "type": "PLAN_CREATE",
                "node_id": "plan_0050",
                "dependencies": [],
                "files_affected": ["src/engine.py", "tests/test_engine.py"],
            }],
            affected_plans={"0050"},
        )
        result = engine.reduce(delta)
        assert result.is_ok
        edges = result.value.graph.edges_from("iden::plan_0050")
        impact_edges = [e for e in edges if e.relation == "wrp:impacts_system"]
        assert len(impact_edges) >= 1

    def test_reduce_lineage_recorded(self):
        """Lineage events are recorded during reduce."""
        engine = KernelEngine()
        delta = KernelDelta(
            delta_id="delta_lineage",
            batch_id="batch_01",
            receipts=[{"id": "rec_001", "plan_id": "0050", "type": "PLAN_CREATE"}],
            affected_plans={"0050"},
        )
        result = engine.reduce(delta)
        assert result.is_ok
        # Should have at least one lineage event
        assert result.value.lineage.event_count() >= 1
        event = result.value.lineage.last_event()
        assert event is not None
        assert event.delta_id == "delta_lineage"
        assert event.step == "reduce"

    def test_reduce_all_or_nothing(self):
        """If a step fails, state is unchanged (all-or-nothing)."""
        engine = KernelEngine()
        # Process a good delta first
        d1 = KernelDelta(
            delta_id="d1", batch_id="b1",
            receipts=[{"id": "rec_001", "type": "PLAN_CREATE"}],
        )
        r1 = engine.reduce(d1)
        assert r1.is_ok
        version_after_good = r1.value.version

        # Process a bad delta (duplicate receipt)
        d2 = KernelDelta(
            delta_id="d2", batch_id="b1",
            receipts=[
                {"id": "rec_002", "type": "IMPLEMENTATION"},
                {"id": "rec_001", "type": "IMPLEMENTATION"},  # duplicate with d1
            ],
        )
        r2 = engine.reduce(d2)
        assert r2.is_error
        # State should be unchanged from after d1
        assert engine.kernel_state.version == version_after_good

    def test_reduce_exception_tolerance(self):
        """Unexpected exceptions in reduce are caught and returned as errors."""
        engine = KernelEngine()
        # Cause an exception: receipt without dict methods
        delta = KernelDelta(
            delta_id="delta_exc",
            batch_id="batch_01",
            receipts=None,  # type: ignore
        )
        result = engine.reduce(delta)
        assert result.is_error
        assert result.error.type == "INVARIANT_VIOLATION"

    def test_reset_engine(self):
        """reset() reinitializes to empty state."""
        engine = KernelEngine()
        delta = KernelDelta(delta_id="d1", batch_id="b1")
        engine.reduce(delta)
        assert engine.kernel_state.version == 1
        engine.reset()
        assert engine.kernel_state.version == 0
        assert engine.kernel_state.receipts == {}


# ══════════════════════════════════════════════════════════════════════
# Section 9: Engine tests — Reconstruction (KSRA)
# ══════════════════════════════════════════════════════════════════════

class TestKernelReconstruction:
    def test_reconstruct_from_genesis(self):
        """Reconstruct from genesis (no snapshot) works."""
        deltas = [
            KernelDelta(
                delta_id="d1", batch_id="b1", version=1,
                receipts=[{"id": "rec_001", "plan_id": "0050", "type": "PLAN_CREATE"}],
                affected_plans={"0050"},
            ),
        ]
        state = reconstruct_kernel_state(snapshot_state=None, deltas=deltas)
        assert state.version == 1
        assert "rec_001" in state.receipts

    def test_reconstruct_from_snapshot(self):
        """Reconstruct from a snapshot replays only newer deltas."""
        # Create initial state at version 5
        initial = KernelState()
        # Manually set version to 5 with some data
        initial.version = 5
        initial.receipts = {"rec_005": {"id": "rec_005", "type": "PLAN_CREATE"}}
        initial.plans = {"0050"}
        snap_data = initial.to_dict()

        # Deltas > version 5
        deltas = [
            KernelDelta(
                delta_id="d6", batch_id="b1", version=6,
                receipts=[{"id": "rec_006", "plan_id": "0051", "type": "PLAN_CREATE"}],
                affected_plans={"0051"},
            ),
        ]

        state = reconstruct_kernel_state(snapshot_state=snap_data, deltas=deltas)
        assert state.version == 6
        assert "rec_005" in state.receipts   # from snapshot
        assert "rec_006" in state.receipts   # from replay

    def test_reconstruct_filters_older_deltas(self):
        """Deltas with version <= snapshot version are not replayed."""
        initial = KernelState()
        initial.version = 10
        snap_data = initial.to_dict()

        deltas = [
            KernelDelta(delta_id="d5", batch_id="b1", version=5),  # older
            KernelDelta(delta_id="d11", batch_id="b1", version=11),  # newer
        ]
        state = reconstruct_kernel_state(snapshot_state=snap_data, deltas=deltas)
        # Version should be 10 + 1 = 11 (only d11 replayed)
        assert state.version == 11

    def test_reconstruct_multi_delta(self):
        """Multiple deltas are replayed in order."""
        deltas = [
            KernelDelta(
                delta_id="d1", batch_id="b1", version=1,
                receipts=[{"id": "r1", "type": "PLAN_CREATE"}],
            ),
            KernelDelta(
                delta_id="d2", batch_id="b1", version=2,
                receipts=[{"id": "r2", "type": "IMPLEMENTATION"}],
            ),
            KernelDelta(
                delta_id="d3", batch_id="b1", version=3,
                receipts=[{"id": "r3", "type": "REVIEW_PASS"}],
            ),
        ]
        state = reconstruct_kernel_state(None, deltas)
        assert state.version == 3
        assert "r1" in state.receipts
        assert "r2" in state.receipts
        assert "r3" in state.receipts

    def test_reconstruct_error_tolerance(self):
        """Reconstruction logs errors and continues (partial insight)."""
        # A delta that will fail during replay
        bad_delta = KernelDelta(
            delta_id="bad", batch_id="b1", version=1,
            receipts=[{"type": "NO_ID"}],  # missing id → validation error
        )
        # A good delta after it
        good_delta = KernelDelta(
            delta_id="good", batch_id="b1", version=2,
            receipts=[{"id": "r2", "type": "PLAN_CREATE"}],
        )

        from wrp_kernel.engine import reconstruct_kernel_state
        state = reconstruct_kernel_state(None, [bad_delta, good_delta])
        # The good delta should still have been processed
        # (the error in bad delta is logged and not thrown)
        assert "r2" in state.receipts


# ══════════════════════════════════════════════════════════════════════
# Section 10: Integration — e2e workflow simulation
# ══════════════════════════════════════════════════════════════════════

class TestKernelIntegration:
    def test_plan_lifecycle_via_kernel(self):
        """Simulate a plan's lifecycle through the kernel."""
        engine = KernelEngine()

        # Stage 1: Plan created
        d1 = KernelDelta(
            delta_id="lifecycle_1", batch_id="lifecycle",
            receipts=[{
                "id": "rec_pc", "plan_id": "0100", "type": "PLAN_CREATE",
                "node_id": "plan_0100", "dependencies": [],
            }],
            affected_plans={"0100"},
        )
        r1 = engine.reduce(d1)
        assert r1.is_ok
        assert r1.value.identity.known_count() == 1

        # Stage 2: Implementation
        d2 = KernelDelta(
            delta_id="lifecycle_2", batch_id="lifecycle",
            receipts=[{
                "id": "rec_imp", "plan_id": "0100", "type": "IMPLEMENTATION",
                "node_id": "plan_0100", "dependencies": [],
            }],
            affected_plans={"0100"},
        )
        r2 = engine.reduce(d2)
        assert r2.is_ok
        assert r2.value.version == 2

        # Stage 3: Review pass
        d3 = KernelDelta(
            delta_id="lifecycle_3", batch_id="lifecycle",
            receipts=[{
                "id": "rec_rp", "plan_id": "0100", "type": "REVIEW_PASS",
                "node_id": "plan_0100", "dependencies": [],
            }],
            affected_plans={"0100"},
        )
        r3 = engine.reduce(d3)
        assert r3.is_ok
        assert r3.value.version == 3

        # Verify full receipt chain is captured
        assert len(r3.value.receipts) == 3
        assert r3.value.plans == {"0100"}
        assert r3.value.lineage.event_count() == 3

    def test_cross_plan_dependency_graph(self):
        """Multiple plans with dependencies build a cross-plan graph.

        Plans are materialized in dependency order (leaves first)
        so forward references resolve correctly.
        """
        engine = KernelEngine()

        # Plan C (leaf — no dependencies)
        d_c = KernelDelta(
            delta_id="plan_c", batch_id="cross",
            receipts=[{
                "id": "rec_c", "plan_id": "0102", "type": "PLAN_CREATE",
                "node_id": "plan_0102", "dependencies": [],
            }],
            affected_plans={"0102"},
        )
        engine.reduce(d_c)

        # Plan B depends on C
        d_b = KernelDelta(
            delta_id="plan_b", batch_id="cross",
            receipts=[{
                "id": "rec_b", "plan_id": "0101", "type": "PLAN_CREATE",
                "node_id": "plan_0101", "dependencies": ["0102"],
            }],
            affected_plans={"0101"},
        )
        engine.reduce(d_b)

        # Plan A depends on B
        d_a = KernelDelta(
            delta_id="plan_a", batch_id="cross",
            receipts=[{
                "id": "rec_a", "plan_id": "0100", "type": "PLAN_CREATE",
                "node_id": "plan_0100", "dependencies": ["0101"],
            }],
            affected_plans={"0100"},
        )
        engine.reduce(d_a)

        state = engine.kernel_state

        # Verify 3 identities
        assert state.identity.known_count() == 3

        # Verify dependency edges
        a_edges = state.graph.edges_from("iden::plan_0100")
        dep_edges = [e for e in a_edges if e.relation == "wrp:depends_on"]
        assert len(dep_edges) >= 1
        assert dep_edges[0].target == "iden::plan_0101"

        # BFS traversal from A should reach C in 2 hops
        all_from_a = state.graph.traverse("iden::plan_0100", relation="wrp:depends_on", depth=2)
        targets = {e.target for e in all_from_a}
        assert "iden::plan_0102" in targets

    def test_kernel_serialization_roundtrip(self):
        """Full state serialization survives round-trip."""
        engine = KernelEngine()

        # Build some state
        receipts = [
            {"id": "r1", "plan_id": "0200", "type": "PLAN_CREATE", "node_id": "plan_0200"},
            {"id": "r2", "plan_id": "0201", "type": "IMPLEMENTATION", "node_id": "plan_0201"},
        ]
        for i, rec in enumerate(receipts):
            d = KernelDelta(
                delta_id=f"st_d{i}", batch_id="st",
                receipts=[rec],
                affected_plans={rec["plan_id"]},
            )
            engine.reduce(d)

        # Serialize
        data = engine.kernel_state.to_dict()

        # Deserialize into a new state
        restored = KernelState.from_dict(data)

        # Verify
        assert restored.version == engine.kernel_state.version
        assert len(restored.receipts) == 2
        assert restored.identity.known_count() == 2
        assert restored.lineage.event_count() == 2

    def test_idempotency(self):
        """Applying the same delta twice (same id) is idempotent.

        The engine already deduplicates by receipt_id within a single delta.
        This test ensures that playing the same delta against the engine
        results in correct (idempotent) state: the duplicate receipt
        hits the duplicate check and is rejected.
        """
        engine = KernelEngine()
        rec = {"id": "rec_idem", "plan_id": "0300", "type": "PLAN_CREATE"}

        # First apply — should succeed
        d1 = KernelDelta(
            delta_id="d_idem_1", batch_id="idem",
            receipts=[rec],
            affected_plans={"0300"},
        )
        r1 = engine.reduce(d1)
        assert r1.is_ok
        assert r1.value.version == 1

        # Second apply with same receipt — should fail (duplicate)
        d2 = KernelDelta(
            delta_id="d_idem_2", batch_id="idem",
            receipts=[rec],  # same receipt id
            affected_plans={"0300"},
        )
        r2 = engine.reduce(d2)
        assert r2.is_error
        assert "Duplicate" in r2.error.message


# ══════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
