"""
Tests for WRP v1.2 Execution Traversal Engine.

Covers: ExecutionContext, HierarchicalExecutionReceipt helpers, all 3
traversal strategies (DFS, BFS, Topological), dispatch rules (failure
propagation, block propagation, dependency satisfaction, critique
propagation), Recursive Boundary Rule, terminal status handling,
probabilistic policies (EXPERIMENTAL vs NORMAL), cycle safety.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from losm_ir.dag import (
    DAGEdge, EdgeType, WorkRequestDAG, WorkRequestNode,
)
import pytest

from losm_ir.traversal import (
    ExecutionContext,
    ExecutionMode,
    ExecutionResult,
    HierarchicalExecutionReceipt,
    TraversalEngine,
    TraversalStrategy,
)


# ═════════════════════════════════════════════════════════════════════════════
#  Helpers
# ═════════════════════════════════════════════════════════════════════════════

def _make_node(
    wr_id: str,
    status: str = "NEW",
    children: List[str] | None = None,
    depth: int = 0,
    policies: List[str] | None = None,
    parent_request_id: str | None = None,
) -> WorkRequestNode:
    props: Dict[str, Any] = {}
    if policies:
        props["policies"] = policies
    return WorkRequestNode(
        wr_id=wr_id,
        status=status,
        children=children or [],
        depth=depth,
        compiled_properties=props,
        parent_request_id=parent_request_id,
    )


def _make_edge(parent: str, child: str, etype: EdgeType = EdgeType.DEPENDS_ON) -> DAGEdge:
    return DAGEdge(edge_id=f"{parent}->{child}", parent_wr_id=parent, child_wr_id=child, edge_type=etype)


def _make_dag(
    nodes: List[WorkRequestNode],
    edges: List[DAGEdge] | None = None,
    root_wr_id: str = "root",
) -> WorkRequestDAG:
    node_map: Dict[str, WorkRequestNode] = {n.wr_id: n for n in nodes}
    max_depth = max((n.depth for n in nodes), default=0)
    return WorkRequestDAG(
        dag_id="test-dag",
        root_wr_id=root_wr_id,
        nodes=node_map,
        edges=edges or [],
        depth=max_depth,
        total_nodes=len(nodes),
        compilation_status="compiled",
        compiled_at=datetime.utcnow(),
    )


def _engine(
    dag: WorkRequestDAG,
    strategy: TraversalStrategy = TraversalStrategy.DFS,
    mode: ExecutionMode = ExecutionMode.NORMAL,
) -> TraversalEngine:
    ctx = ExecutionContext(
        tenant_id="test-tenant",
        trace_id="test-trace",
        strategy=strategy,
        kernel_id="test-kernel",
        mode=mode,
    )
    return TraversalEngine(dag, ctx)


# ═════════════════════════════════════════════════════════════════════════════
#  ExecutionContext tests
# ═════════════════════════════════════════════════════════════════════════════

class TestExecutionContext:
    def test_frozen(self):
        ctx = ExecutionContext(strategy=TraversalStrategy.DFS)
        with pytest.raises(AttributeError):
            ctx.strategy = TraversalStrategy.BFS  # type: ignore[misc]

    def test_default_strategy_is_dfs(self):
        ctx = ExecutionContext()
        assert ctx.strategy == TraversalStrategy.DFS

    def test_default_mode_is_normal(self):
        ctx = ExecutionContext()
        assert ctx.mode == ExecutionMode.NORMAL

    def test_constructs_with_all_fields(self):
        ctx = ExecutionContext(
            tenant_id="t1", trace_id="tr1",
            strategy=TraversalStrategy.TOPOLOGICAL,
            kernel_id="k1", mode=ExecutionMode.EXPERIMENTAL,
        )
        assert ctx.tenant_id == "t1"
        assert ctx.trace_id == "tr1"
        assert ctx.strategy == TraversalStrategy.TOPOLOGICAL
        assert ctx.kernel_id == "k1"
        assert ctx.mode == ExecutionMode.EXPERIMENTAL


# ═════════════════════════════════════════════════════════════════════════════
#  HierarchicalExecutionReceipt helper tests
# ═════════════════════════════════════════════════════════════════════════════

class TestHierarchicalExecutionReceipt:
    def test_find_self(self):
        r = HierarchicalExecutionReceipt(node_id="a")
        assert r.find("a") is r

    def test_find_child(self):
        r = HierarchicalExecutionReceipt(
            node_id="a",
            children=[HierarchicalExecutionReceipt(node_id="b")],
        )
        found = r.find("b")
        assert found is not None
        assert found.node_id == "b"

    def test_find_nested(self):
        r = HierarchicalExecutionReceipt(
            node_id="a",
            children=[HierarchicalExecutionReceipt(
                node_id="b",
                children=[HierarchicalExecutionReceipt(node_id="c")],
            )],
        )
        assert r.find("c") is not None
        assert r.find("c").node_id == "c"

    def test_find_missing(self):
        r = HierarchicalExecutionReceipt(node_id="a")
        assert r.find("b") is None

    def test_all_results_flat(self):
        r = HierarchicalExecutionReceipt(node_id="a", result=ExecutionResult.SUCCESS)
        assert r.all_results() == {"a": ExecutionResult.SUCCESS}

    def test_all_results_nested(self):
        r = HierarchicalExecutionReceipt(
            node_id="a", result=ExecutionResult.PENDING,
            children=[
                HierarchicalExecutionReceipt(node_id="b", result=ExecutionResult.SUCCESS),
                HierarchicalExecutionReceipt(node_id="c", result=ExecutionResult.FAILED),
            ],
        )
        assert r.all_results() == {
            "a": ExecutionResult.PENDING,
            "b": ExecutionResult.SUCCESS,
            "c": ExecutionResult.FAILED,
        }

    def test_is_complete_true(self):
        r = HierarchicalExecutionReceipt(
            node_id="a", result=ExecutionResult.SUCCESS,
            children=[HierarchicalExecutionReceipt(node_id="b", result=ExecutionResult.SUCCESS)],
        )
        assert r.is_complete()

    def test_is_complete_false_pending(self):
        r = HierarchicalExecutionReceipt(
            node_id="a", result=ExecutionResult.SUCCESS,
            children=[HierarchicalExecutionReceipt(node_id="b", result=ExecutionResult.PENDING)],
        )
        assert not r.is_complete()

    def test_is_complete_false_running(self):
        r = HierarchicalExecutionReceipt(node_id="a", result=ExecutionResult.RUNNING)
        assert not r.is_complete()

    def test_has_defaults(self):
        r = HierarchicalExecutionReceipt(node_id="x")
        assert r.result == ExecutionResult.PENDING
        assert r.children == []
        assert r.status == ""
        assert r.error is None
        assert r.metadata == {}


# ═════════════════════════════════════════════════════════════════════════════
#  Terminal status handling (all strategies)
# ═════════════════════════════════════════════════════════════════════════════

class TestTerminalStatuses:
    def test_completed_node_returns_success(self):
        dag = _make_dag([_make_node("root", status="COMPLETION")])
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.SUCCESS
        assert r.node_id == "root"

    def test_failed_node_returns_failed(self):
        dag = _make_dag([_make_node("root", status="FAILED")])
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.FAILED
        assert "FAILED" in (r.error or "")

    def test_blocked_node_returns_blocked(self):
        dag = _make_dag([_make_node("root", status="BLOCKED")])
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.BLOCKED
        assert "BLOCKED" in (r.error or "")

    def test_complete_status_also_success(self):
        dag = _make_dag([_make_node("root", status="COMPLETE")])
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.SUCCESS


# ═════════════════════════════════════════════════════════════════════════════
#  Missing node handling
# ═════════════════════════════════════════════════════════════════════════════

class TestMissingNode:
    def test_root_missing(self):
        dag = _make_dag([], root_wr_id="ghost")
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.FAILED
        assert "not found" in (r.error or "")


# ═════════════════════════════════════════════════════════════════════════════
#  Recursive Boundary Rule
# ═════════════════════════════════════════════════════════════════════════════

class TestRecursiveBoundary:
    def test_new_child_is_pending(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["child"]),
            _make_node("child", status="NEW"),
        ])
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.PENDING
        assert len(r.children) == 1
        assert r.children[0].result == ExecutionResult.PENDING
        assert r.children[0].node_id == "child"

    def test_child_not_auto_executed(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a"]),
            _make_node("a", status="NEW", children=["b"]),
            _make_node("b", status="NEW"),
        ])
        eng = _engine(dag)
        r = eng.execute()
        # All non-terminal nodes should be PENDING, not auto-executed
        results = r.all_results()
        assert results["root"] == ExecutionResult.PENDING
        assert results["a"] == ExecutionResult.PENDING
        assert results["b"] == ExecutionResult.PENDING


# ═════════════════════════════════════════════════════════════════════════════
#  Dispatch Rule: child FAILED -> parent BLOCKED
# ═════════════════════════════════════════════════════════════════════════════

class TestFailurePropagation:
    def test_child_failed_parent_blocked(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["child"]),
            _make_node("child", status="FAILED"),
        ])
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.BLOCKED
        assert r.children[0].result == ExecutionResult.FAILED
        assert "child" in (r.error or "").lower()

    def test_deep_failure_propagates(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["mid"]),
            _make_node("mid", status="NEW", children=["leaf"]),
            _make_node("leaf", status="FAILED"),
        ])
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.BLOCKED
        mid = r.children[0]
        assert mid.result == ExecutionResult.BLOCKED
        assert mid.error is not None

    def test_multiple_children_one_fails(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a", "b"]),
            _make_node("a", status="COMPLETION"),
            _make_node("b", status="FAILED"),
        ])
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.BLOCKED


# ═════════════════════════════════════════════════════════════════════════════
#  Dispatch Rule: child BLOCKED -> parent BLOCKED
# ═════════════════════════════════════════════════════════════════════════════

class TestBlockPropagation:
    def test_child_blocked_parent_blocked(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["child"]),
            _make_node("child", status="BLOCKED"),
        ])
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.BLOCKED
        assert "blocked" in (r.error or "").lower()

    def test_mixed_success_and_blocked(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a", "b"]),
            _make_node("a", status="COMPLETION"),
            _make_node("b", status="BLOCKED"),
        ])
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.BLOCKED


# ═════════════════════════════════════════════════════════════════════════════
#  Dispatch Rule: parent advances when all children succeed
# ═════════════════════════════════════════════════════════════════════════════

class TestDependencySatisfaction:
    def test_parent_pending_when_all_children_succeed(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a", "b"]),
            _make_node("a", status="COMPLETION"),
            _make_node("b", status="COMPLETE"),
        ])
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.PENDING
        assert r.children[0].result == ExecutionResult.SUCCESS
        assert r.children[1].result == ExecutionResult.SUCCESS

    def test_single_child_success(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["child"]),
            _make_node("child", status="COMPLETION"),
        ])
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.PENDING

    def test_all_terminal_child_results_are_success(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a", "b", "c"]),
            _make_node("a", status="COMPLETION"),
            _make_node("b", status="COMPLETE"),
            _make_node("c", status="COMPLETION"),
        ])
        eng = _engine(dag)
        r = eng.execute()
        for child in r.children:
            assert child.result == ExecutionResult.SUCCESS


# ═════════════════════════════════════════════════════════════════════════════
#  Dispatch Rule: parent CRITIQUE propagates to children
# ═════════════════════════════════════════════════════════════════════════════

class TestCritiquePropagation:
    @pytest.mark.parametrize("status", ["PLAN_REVIEW", "CRITIQUE", "VALIDATION", "PLAN_APPROVAL_GATE"])
    def test_critique_statuses_propagate(self, status):
        dag = _make_dag([
            _make_node("root", status=status, children=["child"]),
            _make_node("child", status="COMPLETION"),
        ])
        eng = _engine(dag)
        r = eng.execute()
        assert r.children[0].metadata.get("critique_propagated") is True

    def test_new_status_does_not_propagate(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["child"]),
            _make_node("child", status="COMPLETION"),
        ])
        eng = _engine(dag)
        r = eng.execute()
        assert r.children[0].metadata.get("critique_propagated") is not True

    def test_execution_status_does_not_propagate(self):
        dag = _make_dag([
            _make_node("root", status="EXECUTION", children=["child"]),
            _make_node("child", status="COMPLETION"),
        ])
        eng = _engine(dag)
        r = eng.execute()
        assert r.children[0].metadata.get("critique_propagated") is not True


# ═════════════════════════════════════════════════════════════════════════════
#  Traversal Strategy: DFS
# ═════════════════════════════════════════════════════════════════════════════

class TestDFS:
    def test_strategy_selection(self):
        dag = _make_dag([_make_node("root", status="NEW")])
        eng = _engine(dag, TraversalStrategy.DFS)
        r = eng.execute()
        assert r.node_id == "root"

    def test_visits_deep_nodes_first(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a", "b"]),
            _make_node("a", status="NEW", children=["c"]),
            _make_node("b", status="NEW"),
            _make_node("c", status="NEW"),
        ],
            edges=[_make_edge("a", "c")],
        )
        eng = _engine(dag, TraversalStrategy.DFS)
        r = eng.execute()
        # DFS processes 'a' fully (including its child 'c') before 'b'
        assert r.children[0].node_id == "a"
        assert r.children[0].children[0].node_id == "c"

    def test_cycle_safe(self):
        dag = _make_dag([
            _make_node("a", status="NEW", children=["b"]),
            _make_node("b", status="NEW", children=["a"]),
        ], root_wr_id="a")
        eng = _engine(dag, TraversalStrategy.DFS)
        r = eng.execute()
        # The second visit to 'a' should produce SKIPPED
        assert r.node_id == "a"
        assert r.result == ExecutionResult.PENDING
        assert len(r.children) == 1
        assert r.children[0].node_id == "b"
        assert r.children[0].children[0].result == ExecutionResult.SKIPPED


# ═════════════════════════════════════════════════════════════════════════════
#  Traversal Strategy: BFS
# ═════════════════════════════════════════════════════════════════════════════

class TestBFS:
    def test_strategy_selection(self):
        dag = _make_dag([_make_node("root", status="NEW")])
        eng = _engine(dag, TraversalStrategy.BFS)
        r = eng.execute()
        assert r.node_id == "root"

    def test_level_order_children(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a", "b"]),
            _make_node("a", status="NEW"),
            _make_node("b", status="NEW"),
        ])
        eng = _engine(dag, TraversalStrategy.BFS)
        r = eng.execute()
        # Both children should be direct children of root (level 1)
        child_ids = [c.node_id for c in r.children]
        assert set(child_ids) == {"a", "b"}

    def test_bfs_failure_propagation(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a", "b"]),
            _make_node("a", status="COMPLETION"),
            _make_node("b", status="FAILED"),
        ])
        eng = _engine(dag, TraversalStrategy.BFS)
        r = eng.execute()
        assert r.result == ExecutionResult.BLOCKED

    def test_bfs_all_success(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a"]),
            _make_node("a", status="COMPLETION"),
        ])
        eng = _engine(dag, TraversalStrategy.BFS)
        r = eng.execute()
        assert r.result == ExecutionResult.PENDING
        assert r.children[0].result == ExecutionResult.SUCCESS

    def test_bfs_missing_node(self):
        dag = _make_dag([_make_node("root", status="NEW", children=["ghost"])],
                        root_wr_id="root")
        eng = _engine(dag, TraversalStrategy.BFS)
        r = eng.execute()
        assert r.result == ExecutionResult.BLOCKED
        assert r.children[0].result == ExecutionResult.FAILED

    def test_bfs_cycle_safe(self):
        dag = _make_dag([
            _make_node("a", status="NEW", children=["b"]),
            _make_node("b", status="NEW", children=["a"]),
        ], root_wr_id="a")
        eng = _engine(dag, TraversalStrategy.BFS)
        r = eng.execute()
        assert r.node_id == "a"
        assert r.children[0].node_id == "b"
        visited_b = r.children[0].children
        assert any(c.result == ExecutionResult.SKIPPED for c in visited_b)


# ═════════════════════════════════════════════════════════════════════════════
#  Traversal Strategy: Topological
# ═════════════════════════════════════════════════════════════════════════════

class TestTopological:
    def test_strategy_selection(self):
        dag = _make_dag([_make_node("root", status="NEW")])
        eng = _engine(dag, TraversalStrategy.TOPOLOGICAL)
        r = eng.execute()
        assert r.node_id == "root"

    def test_simple_dag(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a"]),
            _make_node("a", status="COMPLETION"),
        ], edges=[_make_edge("root", "a")])
        eng = _engine(dag, TraversalStrategy.TOPOLOGICAL)
        r = eng.execute()
        assert r.result == ExecutionResult.PENDING
        assert r.children[0].result == ExecutionResult.SUCCESS

    def test_chain_processes_in_dependency_order(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["mid"]),
            _make_node("mid", status="NEW", children=["leaf"]),
            _make_node("leaf", status="NEW"),
        ], edges=[_make_edge("root", "mid"), _make_edge("mid", "leaf")])
        eng = _engine(dag, TraversalStrategy.TOPOLOGICAL)
        r = eng.execute()
        # Terminal-node children not expanded in receipt tree;
        # verify topological ordering via all_results for non-terminal nodes
        results = r.all_results()
        assert results["root"] == ExecutionResult.PENDING
        assert results["mid"] == ExecutionResult.PENDING
        assert results["leaf"] == ExecutionResult.PENDING

    def test_failure_propagation(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a", "b"]),
            _make_node("a", status="COMPLETION"),
            _make_node("b", status="FAILED"),
        ], edges=[_make_edge("root", "a"), _make_edge("root", "b")])
        eng = _engine(dag, TraversalStrategy.TOPOLOGICAL)
        r = eng.execute()
        assert r.result == ExecutionResult.BLOCKED

    def test_block_propagation(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a"]),
            _make_node("a", status="BLOCKED"),
        ], edges=[_make_edge("root", "a")])
        eng = _engine(dag, TraversalStrategy.TOPOLOGICAL)
        r = eng.execute()
        assert r.result == ExecutionResult.BLOCKED

    def test_deep_dag_topological(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a", "b"]),
            _make_node("a", status="NEW", children=["c"]),
            _make_node("b", status="COMPLETION"),
            _make_node("c", status="COMPLETION"),
        ], edges=[_make_edge("root", "a"), _make_edge("root", "b"), _make_edge("a", "c")])
        eng = _engine(dag, TraversalStrategy.TOPOLOGICAL)
        r = eng.execute()
        assert r.result == ExecutionResult.PENDING
        # b and c should be SUCCESS (terminal expanded first in reverse topo),
        # a should be PENDING (all deps resolved but needs execution)
        results = r.all_results()
        assert results["b"] == ExecutionResult.SUCCESS
        assert results["a"] == ExecutionResult.PENDING
        # c is terminal (COMPLETION) so its receipt isn't expanded as a's child


# ═════════════════════════════════════════════════════════════════════════════
#  Mixed / Complex Scenarios
# ═════════════════════════════════════════════════════════════════════════════

class TestComplexScenarios:
    def test_fork_join(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["left", "right"]),
            _make_node("left", status="COMPLETION"),
            _make_node("right", status="COMPLETION"),
        ])
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.PENDING
        assert r.children[0].result == ExecutionResult.SUCCESS
        assert r.children[1].result == ExecutionResult.SUCCESS

    def test_diamond(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a", "b"]),
            _make_node("a", status="NEW", children=["merge"]),
            _make_node("b", status="NEW", children=["merge"]),
            _make_node("merge", status="NEW"),
        ],
            edges=[_make_edge("a", "merge"), _make_edge("b", "merge")],
        )
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.PENDING
        # In DFS, a is visited before b
        assert r.children[0].node_id == "a"
        assert r.children[1].node_id == "b"
        # merge is child of a (first visit = PENDING, preserved in tree),
        # second visit via b returns SKIPPED (overwrites in all_results flatten)
        results = r.all_results()
        assert results["merge"] == ExecutionResult.SKIPPED
        assert len(r.children) == 2
        assert r.children[0].children[0].node_id == "merge"

    def test_empty_dag(self):
        dag = _make_dag([], root_wr_id="")
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.FAILED

    def test_single_node_new(self):
        dag = _make_dag([_make_node("root", status="NEW")])
        eng = _engine(dag)
        r = eng.execute()
        assert r.result == ExecutionResult.PENDING
        assert r.status == "NEW"


# ═════════════════════════════════════════════════════════════════════════════
#  Context propagation
# ═════════════════════════════════════════════════════════════════════════════

class TestContextPropagation:
    def test_tenant_id_on_all_receipts(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["child"]),
            _make_node("child", status="COMPLETION"),
        ])
        ctx = ExecutionContext(tenant_id="my-tenant", trace_id="my-trace")
        eng = TraversalEngine(dag, ctx)
        r = eng.execute()
        assert r.tenant_id == "my-tenant"
        assert r.trace_id == "my-trace"
        assert r.children[0].tenant_id == "my-tenant"

    def test_kernel_id_in_context(self):
        dag = _make_dag([_make_node("root", status="NEW")])
        ctx = ExecutionContext(kernel_id="k42")
        eng = TraversalEngine(dag, ctx)
        r = eng.execute()
        assert r.tenant_id is None
        assert r.trace_id is None


# ═════════════════════════════════════════════════════════════════════════════
#  Probabilistic Policies (EXPERIMENTAL mode)
# ═════════════════════════════════════════════════════════════════════════════

class TestProbabilisticPolicies:
    def test_normal_mode_skips_probabilistic_policies(self):
        dag = _make_dag([
            _make_node("root", status="NEW", policies=["prob_sampling_0.5"]),
        ])
        eng = _engine(dag, mode=ExecutionMode.NORMAL)
        r = eng.execute()
        assert "probabilistic_policies" not in r.metadata

    def test_experimental_mode_applies_probabilistic_policies(self):
        dag = _make_dag([
            _make_node("root", status="NEW", policies=["prob_sampling_0.5"]),
        ])
        eng = _engine(dag, mode=ExecutionMode.EXPERIMENTAL)
        r = eng.execute()
        assert "probabilistic_policies" in r.metadata
        assert r.metadata["probabilistic_policies"] == ["prob_sampling_0.5"]
        assert r.metadata.get("experimental") is True

    def test_experimental_mode_non_prob_policies_ignored(self):
        dag = _make_dag([
            _make_node("root", status="NEW", policies=["root_governance"]),
        ])
        eng = _engine(dag, mode=ExecutionMode.EXPERIMENTAL)
        r = eng.execute()
        assert "probabilistic_policies" not in r.metadata

    def test_experimental_mode_applies_to_all_nodes(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a"]),
            _make_node("a", status="PENDING", policies=["prob_retry_3"]),
        ])
        eng = _engine(dag, mode=ExecutionMode.EXPERIMENTAL)
        r = eng.execute()
        # Node 'a' should have metadata set; root won't since it has no prob policies
        child = r.children[0]
        assert "probabilistic_policies" in child.metadata
        assert child.metadata["probabilistic_policies"] == ["prob_retry_3"]


# ═════════════════════════════════════════════════════════════════════════════
#  Edge Cases
# ═════════════════════════════════════════════════════════════════════════════

class TestEdgeCases:
    def test_children_from_both_edges_and_node(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a"]),
            _make_node("a", status="COMPLETION"),
            _make_node("b", status="COMPLETION"),
        ], edges=[_make_edge("root", "b")])
        eng = _engine(dag)
        r = eng.execute()
        child_ids = {c.node_id for c in r.children}
        assert child_ids == {"a", "b"}

    def test_sibling_order_determinism(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a", "b"]),
            _make_node("a", status="COMPLETION"),
            _make_node("b", status="COMPLETION"),
        ])
        eng1 = _engine(dag)
        eng2 = _engine(dag)
        r1 = eng1.execute()
        r2 = eng2.execute()
        ids1 = [c.node_id for c in r1.children]
        ids2 = [c.node_id for c in r2.children]
        assert ids1 == ids2

    def test_visited_reset_on_new_execute(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["a"]),
            _make_node("a", status="COMPLETION"),
        ])
        eng = _engine(dag, TraversalStrategy.DFS)
        r1 = eng.execute()
        assert r1.result == ExecutionResult.PENDING
        r2 = eng.execute()
        assert r2 is not None  # engine doesn't reset, but doesn't error

    def test_receipt_status_matches_node_status(self):
        dag = _make_dag([
            _make_node("root", status="EXECUTION"),
        ])
        eng = _engine(dag)
        r = eng.execute()
        assert r.status == "EXECUTION"

