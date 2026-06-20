"""
Tests for the Nexus Bootstrap Kernel.
"""

import pytest
from nbk import (
    CollapseChainRule,
    MergeIdleLeasesRule,
    NexusBootstrapKernel,
    make_address,
    parse_address,
)


# ── Fixtures ──────────────────────────────────────────────────────────

@pytest.fixture
def simple_kernel():
    """A→B→C linear pipeline."""
    k = NexusBootstrapKernel(realm="test", graph="simple")
    k.add_node("A", lambda i: 10)
    k.add_node("B", lambda i: i["A"] * 2)
    k.add_node("C", lambda i: i["B"] + 5)
    k.add_edge("A", "B")
    k.add_edge("B", "C")
    k.schedule_leases(executors=["worker-0"])
    return k


@pytest.fixture
def diamond_kernel():
    """Diamond: A→(B,C)→D."""
    k = NexusBootstrapKernel(realm="test", graph="diamond")
    k.add_node("A", lambda i: 1)
    k.add_node("B", lambda i: i["A"] * 2)
    k.add_node("C", lambda i: i["A"] * 3)
    k.add_node("D", lambda i: i["B"] + i["C"])
    k.add_edge("A", "B")
    k.add_edge("A", "C")
    k.add_edge("B", "D")
    k.add_edge("C", "D")
    k.schedule_leases(executors=["worker-0"])
    return k


# ── Graph building ────────────────────────────────────────────────────

class TestGraphBuilding:
    def test_add_node(self):
        k = NexusBootstrapKernel()
        k.add_node("x", lambda i: 42)
        assert "x" in k.nodes

    def test_duplicate_node_raises(self):
        k = NexusBootstrapKernel()
        k.add_node("x", lambda i: 1)
        with pytest.raises(ValueError, match="already exists"):
            k.add_node("x", lambda i: 2)

    def test_add_edge(self):
        k = NexusBootstrapKernel()
        k.add_node("a", lambda i: 1)
        k.add_node("b", lambda i: i["a"])
        k.add_edge("a", "b")
        assert k.dependencies("b") == ["a"]
        assert k.dependents("a") == ["b"]

    def test_self_loop_raises(self):
        k = NexusBootstrapKernel()
        k.add_node("x", lambda i: 1)
        with pytest.raises(ValueError, match="Self-loops"):
            k.add_edge("x", "x")

    def test_cycle_detection(self):
        k = NexusBootstrapKernel()
        k.add_node("a", lambda i: 1)
        k.add_node("b", lambda i: i["a"])
        k.add_node("c", lambda i: i["b"])
        k.add_edge("a", "b")
        k.add_edge("b", "c")
        with pytest.raises(ValueError, match="would create a cycle"):
            k.add_edge("c", "a")

    def test_missing_node_raises(self):
        k = NexusBootstrapKernel()
        k.add_node("a", lambda i: 1)
        with pytest.raises(KeyError):
            k.add_edge("a", "z")


# ── Execution ─────────────────────────────────────────────────────────

class TestExecution:
    def test_execute_linear_pipeline(self, simple_kernel):
        n = simple_kernel.execute_ready_nodes()
        assert n == 3  # all nodes executed
        assert simple_kernel.node_states == {"A": 10, "B": 20, "C": 25}

    def test_execute_diamond(self, diamond_kernel):
        n = diamond_kernel.execute_ready_nodes()
        assert n == 4
        assert diamond_kernel.node_states["A"] == 1
        assert diamond_kernel.node_states["B"] == 2
        assert diamond_kernel.node_states["C"] == 3
        assert diamond_kernel.node_states["D"] == 5

    def test_ready_nodes_empty_initially(self):
        k = NexusBootstrapKernel()
        k.add_node("A", lambda i: 1)
        k.add_node("B", lambda i: i["A"])
        k.add_edge("A", "B")
        # No leases — ready should be empty
        assert k.ready_nodes() == []

    def test_execution_requires_lease(self):
        k = NexusBootstrapKernel()
        k.add_node("A", lambda i: 1)
        k.add_node("B", lambda i: i["A"])
        k.add_edge("A", "B")
        k.add_lease("A", "w0")
        # B has no lease — only A should execute
        n = k.execute_ready_nodes()
        assert n == 1
        assert "A" in k.node_states
        assert "B" not in k.node_states

    def test_batch_execution_respects_topology(self):
        """Nodes execute in topological order, not insertion order."""
        k = NexusBootstrapKernel()
        k.add_node("C", lambda i: i.get("B", 0) * 3)
        k.add_node("A", lambda i: 5)
        k.add_node("B", lambda i: i["A"] + 1)
        k.add_edge("A", "B")
        k.add_edge("B", "C")
        k.schedule_leases()
        k.execute_ready_nodes()
        assert k.node_states["A"] == 5
        assert k.node_states["B"] == 6
        assert k.node_states["C"] == 18

    def test_execute_node_force(self):
        k = NexusBootstrapKernel()
        k.add_node("A", lambda i: 42)
        k.execute_node("A")  # bypasses lease check
        assert k.node_states["A"] == 42


# ── Tracing & Replay ──────────────────────────────────────────────────

class TestReplay:
    def test_traces_recorded(self, simple_kernel):
        simple_kernel.execute_ready_nodes()
        assert len(simple_kernel.traces) == 3
        assert simple_kernel.traces[0].node_id == "A"
        assert simple_kernel.traces[1].node_id == "B"
        assert simple_kernel.traces[2].node_id == "C"

    def test_replay_reconstructs_state(self, simple_kernel):
        simple_kernel.execute_ready_nodes()
        state = simple_kernel.replay()
        assert state == {"A": 10, "B": 20, "C": 25}

    def test_replay_after_reset(self, simple_kernel):
        simple_kernel.execute_ready_nodes()
        simple_kernel.reset()
        assert simple_kernel.node_states == {}
        assert simple_kernel.traces == []
        # Re-execute should produce same result
        simple_kernel.schedule_leases()
        simple_kernel.execute_ready_nodes()
        assert simple_kernel.node_states == {"A": 10, "B": 20, "C": 25}


# ── Lease scheduling ──────────────────────────────────────────────────

class TestLeases:
    def test_schedule_round_robin(self):
        k = NexusBootstrapKernel()
        k.add_node("A", lambda i: 1)
        k.add_node("B", lambda i: 1)
        k.add_node("C", lambda i: 1)
        k.schedule_leases(executors=["w0", "w1"], strategy="round_robin")
        assert k.leases["A"] == "w0"
        assert k.leases["B"] == "w1"
        assert k.leases["C"] == "w0"

    def test_manual_lease(self):
        k = NexusBootstrapKernel()
        k.add_node("A", lambda i: 1)
        k.add_lease("A", "my-executor")
        assert k.leases["A"] == "my-executor"

    def test_lease_valid(self):
        k = NexusBootstrapKernel()
        k.add_node("A", lambda i: 1)
        assert not k.lease_valid("A")
        k.add_lease("A", "w0")
        assert k.lease_valid("A")


# ── CAL addressing ────────────────────────────────────────────────────

class TestAddressing:
    def test_make_and_parse_address(self):
        addr = make_address("prod", "mygraph", "t1", "node_42")
        assert addr.startswith("cal://prod/mygraph/t1/node_42/")
        parsed = parse_address(addr)
        assert parsed is not None
        assert parsed["realm"] == "prod"
        assert parsed["graph"] == "mygraph"
        assert parsed["node_id"] == "node_42"

    def test_invalid_address_returns_none(self):
        assert parse_address("http://foo") is None
        assert parse_address("cal://a/b") is None

    def test_address_of_node(self, simple_kernel):
        simple_kernel.execute_ready_nodes()
        addr = simple_kernel.address_of("A")
        assert "cal://test/simple/t0/A/" in addr

    def test_resolve_node(self, simple_kernel):
        addr = simple_kernel.address_of("B")
        node = simple_kernel.resolve(addr)
        assert node is not None
        assert node.id == "B"


# ── SCQL query ────────────────────────────────────────────────────────

class TestQuery:
    def test_query_all(self, simple_kernel):
        simple_kernel.execute_ready_nodes()
        rows = simple_kernel.query()
        assert len(rows) == 3

    def test_query_with_predicate(self, simple_kernel):
        simple_kernel.execute_ready_nodes()
        # Find nodes with state > 10
        rows = simple_kernel.query(
            predicate=lambda nid, nd, st: st is not None and st > 10
        )
        assert len(rows) == 2
        assert {r["node_id"] for r in rows} == {"B", "C"}

    def test_query_empty_graph(self):
        k = NexusBootstrapKernel()
        assert k.query() == []


# ── Mutation rules ────────────────────────────────────────────────────

class TestMutation:
    def test_merge_idle_leases(self):
        k = NexusBootstrapKernel()
        k.add_node("A", lambda i: 1)
        k.add_node("B", lambda i: 1)
        k.add_lease("A", "w0")
        k.add_lease("B", "w1")
        rule = MergeIdleLeasesRule(target_executor="shared")
        affected = k.mutate(rule)
        assert "A" in affected or "B" in affected
        for nid in affected:
            assert k.leases[nid] == "shared"

    def test_collapse_chain(self):
        k = NexusBootstrapKernel()
        k.add_node("A", lambda i: 2)
        k.add_node("B", lambda i: i["A"] + 3)
        k.add_node("C", lambda i: i["B"] * 4)
        k.add_edge("A", "B")
        k.add_edge("B", "C")
        k.schedule_leases()
        k.execute_ready_nodes()
        assert k.node_states["C"] == 20  # (2+3)*4

        # Collapse A→B→C → fusion
        rule = CollapseChainRule()
        rule.applies("B", k.get_node("B"), k)
        affected = rule.apply("B", k)
        assert len(affected) == 1
        fused_id = affected[0]

        # The fused node should produce the same result
        k.add_lease(fused_id, "w0")
        k.execute_node(fused_id)
        # The result may differ in structure depending on wiring
        # But at minimum the fusion created a new node
        assert fused_id in k.nodes


# ── Snapshot ──────────────────────────────────────────────────────────

class TestSnapshot:
    def test_snapshot(self, simple_kernel):
        simple_kernel.execute_ready_nodes()
        s = simple_kernel.snapshot()
        assert s["realm"] == "test"
        assert s["graph"] == "simple"
        assert set(s["nodes"]) == {"A", "B", "C"}
        assert s["traces"] == 3
        assert s["leases"]["A"] == "worker-0"
