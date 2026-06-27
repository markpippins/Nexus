"""
WRP v1.2 — Execution Traversal Engine with Hierarchical Receipts

Traverses a compiled WorkRequestDAG and produces tree-structured
execution receipts.  Supports 3 traversal strategies, immutable
ExecutionContext, recursive boundary semantics, and probabilistic
policies (experimental mode only).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple

from pydantic import BaseModel, Field

from losm_ir.dag import WorkRequestDAG, WorkRequestNode


# ── Core Enums ─────────────────────────────────────────────────────────────────

class TraversalStrategy(str, Enum):
    DFS = "dfs"
    BFS = "bfs"
    TOPOLOGICAL = "topological"


class ExecutionMode(str, Enum):
    NORMAL = "normal"
    EXPERIMENTAL = "experimental"


class ExecutionResult(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    BLOCKED = "BLOCKED"
    SKIPPED = "SKIPPED"


# ── ExecutionContext ───────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ExecutionContext:
    """Immutable context for a single traversal run.

    All fields are fixed for the duration of the traversal.  No field
    may be mutated once construction completes.

    Fields:
        tenant_id: Tenant/namespace scope.
        trace_id: Distributed tracing trace ID.
        strategy: Which traversal strategy to use.
        kernel_id: Logical kernel/execution-unit ID.
        mode: Execution mode — NORMAL or EXPERIMENTAL.
              Probabilistic policies are active only in EXPERIMENTAL mode.
    """
    tenant_id: Optional[str] = None
    trace_id: Optional[str] = None
    strategy: TraversalStrategy = TraversalStrategy.DFS
    kernel_id: Optional[str] = None
    mode: ExecutionMode = ExecutionMode.NORMAL


# ── HierarchicalExecutionReceipt ──────────────────────────────────────────────

class HierarchicalExecutionReceipt(BaseModel):
    """Tree-structured execution receipt.

    Unlike the flat ExecutionReceipt (v1.0), this receipt forms a tree
    that mirrors the DAG traversal.  Each receipt carries its children's
    receipts, enabling both top-down and bottom-up analysis.

    Fields:
        node_id: The WorkRequestNode ID this receipt covers.
        tenant_id: Tenant scope (from ExecutionContext).
        trace_id: Trace scope (from ExecutionContext).
        result: The execution result for this node.
        children: Child receipts (tree structure).
        status: The node's status at traversal time.
        error: Error message if result is FAILED or BLOCKED.
        started_at: When this node's traversal began.
        completed_at: When this node's traversal completed.
        metadata: Arbitrary metadata annotations.
    """
    node_id: str
    tenant_id: Optional[str] = None
    trace_id: Optional[str] = None
    result: ExecutionResult = ExecutionResult.PENDING
    children: List[HierarchicalExecutionReceipt] = Field(default_factory=list)
    status: str = ""
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    def find(self, node_id: str) -> Optional[HierarchicalExecutionReceipt]:
        if self.node_id == node_id:
            return self
        for child in self.children:
            found = child.find(node_id)
            if found is not None:
                return found
        return None

    def all_results(self) -> Dict[str, ExecutionResult]:
        results: Dict[str, ExecutionResult] = {self.node_id: self.result}
        for child in self.children:
            results.update(child.all_results())
        return results

    def is_complete(self) -> bool:
        if self.result in (ExecutionResult.PENDING, ExecutionResult.RUNNING):
            return False
        return all(c.is_complete() for c in self.children)


# ── ProbabilisticPolicy ────────────────────────────────────────────────────────

class ProbabilisticPolicy(BaseModel):
    policy_id: str
    node_id: str
    policy_type: str
    probability: float = 1.0
    parameters: Dict[str, Any] = Field(default_factory=dict)


# ── TraversalEngine ────────────────────────────────────────────────────────────

class TraversalEngine:
    """Traverses a compiled WorkRequestDAG and produces hierarchical receipts.

    The engine is stateless with respect to the traversal — all state
    is captured in the returned receipt tree.  Call execute() to run.

    Dispatch rules:
      - child FAILED -> parent BLOCKED (failure propagation)
      - child BLOCKED -> parent BLOCKED (block propagation)
      - parent advances (PENDING) only when all children succeed
      - parent CRITIQUE triggers CRITIQUE on all children
      - Recursive Boundary: child WorkRequests enter PendingExecutionQueue
    """

    def __init__(self, dag: WorkRequestDAG, context: ExecutionContext):
        self._dag = dag
        self._context = context
        self._visited: Set[str] = set()

    def execute(self) -> HierarchicalExecutionReceipt:
        if self._context.strategy == TraversalStrategy.DFS:
            return self._execute_dfs()
        elif self._context.strategy == TraversalStrategy.BFS:
            return self._execute_bfs()
        elif self._context.strategy == TraversalStrategy.TOPOLOGICAL:
            return self._execute_topological()
        raise ValueError(f"Unknown strategy: {self._context.strategy}")

    # ── Receipt factory ─────────────────────────────────────────────

    def _make_receipt(
        self,
        node_id: str,
        result: ExecutionResult = ExecutionResult.PENDING,
        children: Optional[List[HierarchicalExecutionReceipt]] = None,
        error: Optional[str] = None,
        now: Optional[datetime] = None,
    ) -> HierarchicalExecutionReceipt:
        node = self._dag.nodes.get(node_id)
        ts = now or datetime.utcnow()
        return HierarchicalExecutionReceipt(
            node_id=node_id,
            tenant_id=self._context.tenant_id,
            trace_id=self._context.trace_id,
            result=result,
            children=children or [],
            status=node.status if node else "",
            error=error,
            started_at=ts,
        )

    def _receipt_terminal(
        self, node: WorkRequestNode, now: datetime,
    ) -> Optional[HierarchicalExecutionReceipt]:
        if node.status in ("COMPLETION", "COMPLETE"):
            return self._make_receipt(node.wr_id, ExecutionResult.SUCCESS, now=now)
        if node.status in ("FAILED",):
            return self._make_receipt(node.wr_id, ExecutionResult.FAILED,
                                       error=f"Node {node.wr_id} is in FAILED status", now=now)
        if node.status in ("BLOCKED",):
            return self._make_receipt(node.wr_id, ExecutionResult.BLOCKED,
                                       error=f"Node {node.wr_id} is in BLOCKED status", now=now)
        return None

    # ── DFS ─────────────────────────────────────────────────────────

    def _execute_dfs(self) -> HierarchicalExecutionReceipt:
        return self._traverse_dfs(self._dag.root_wr_id)

    def _traverse_dfs(self, node_id: str) -> HierarchicalExecutionReceipt:
        if node_id in self._visited:
            return self._make_receipt(node_id, ExecutionResult.SKIPPED)
        self._visited.add(node_id)

        node = self._dag.nodes.get(node_id)
        if node is None:
            return self._make_receipt(node_id, ExecutionResult.FAILED,
                                       error=f"Node {node_id} not found in DAG")

        now = datetime.utcnow()

        terminal = self._receipt_terminal(node, now)
        if terminal is not None:
            return terminal

        is_critique = node.status in (
            "PLAN_REVIEW", "CRITIQUE", "VALIDATION", "PLAN_APPROVAL_GATE",
        )

        child_ids = self._get_child_ids(node)
        child_receipts: List[HierarchicalExecutionReceipt] = []

        for child_id in child_ids:
            cr = self._traverse_dfs(child_id)
            child_receipts.append(cr)

            if cr.result == ExecutionResult.FAILED:
                return self._make_receipt(
                    node_id, ExecutionResult.BLOCKED, children=child_receipts,
                    error=f"Child {child_id} failed: {cr.error}", now=now,
                )
            if cr.result == ExecutionResult.BLOCKED:
                return self._make_receipt(
                    node_id, ExecutionResult.BLOCKED, children=child_receipts,
                    error=f"Child {child_id} is blocked: {cr.error}", now=now,
                )

        if is_critique:
            for cr in child_receipts:
                cr.metadata["critique_propagated"] = True

        receipt = self._make_receipt(
            node_id, ExecutionResult.PENDING, children=child_receipts, now=now,
        )

        if self._context.mode == ExecutionMode.EXPERIMENTAL:
            self._apply_probabilistic_policies(node_id, receipt)

        return receipt

    # ── BFS ─────────────────────────────────────────────────────────

    def _execute_bfs(self) -> HierarchicalExecutionReceipt:
        root_id = self._dag.root_wr_id
        root_receipt = self._make_receipt(root_id)

        queue: List[Tuple[str, HierarchicalExecutionReceipt]] = [(root_id, root_receipt)]
        visited: Set[str] = set()

        while queue:
            node_id, parent_receipt = queue.pop(0)
            if node_id in visited:
                parent_receipt.result = ExecutionResult.SKIPPED
                continue
            visited.add(node_id)

            node = self._dag.nodes.get(node_id)
            if node is None:
                parent_receipt.result = ExecutionResult.FAILED
                parent_receipt.error = f"Node {node_id} not found in DAG"
                continue

            now = datetime.utcnow()
            terminal = self._receipt_terminal(node, now)
            if terminal is not None:
                parent_receipt.result = terminal.result
                parent_receipt.error = terminal.error
                parent_receipt.status = terminal.status
                continue

            child_ids = self._get_child_ids(node)
            for child_id in child_ids:
                child_receipt = self._make_receipt(child_id, now=now)
                parent_receipt.children.append(child_receipt)
                queue.append((child_id, child_receipt))

            parent_receipt.result = ExecutionResult.PENDING

        self._apply_bfs_dispatch_rules(root_receipt)
        return root_receipt

    def _apply_bfs_dispatch_rules(
        self, receipt: HierarchicalExecutionReceipt,
    ) -> ExecutionResult:
        for child in receipt.children:
            self._apply_bfs_dispatch_rules(child)

        for child in receipt.children:
            if child.result in (ExecutionResult.FAILED, ExecutionResult.BLOCKED):
                if receipt.result not in (ExecutionResult.FAILED, ExecutionResult.BLOCKED):
                    receipt.result = ExecutionResult.BLOCKED
                    receipt.error = f"Child {child.node_id} {child.result.value}"
        return receipt.result

    # ── Topological ──────────────────────────────────────────────────

    def _execute_topological(self) -> HierarchicalExecutionReceipt:
        adj: Dict[str, List[str]] = {}
        in_degree: Dict[str, int] = {}
        for nid in self._dag.nodes:
            adj[nid] = []
            in_degree[nid] = 0

        for e in self._dag.edges:
            if e.parent_wr_id in adj:
                adj[e.parent_wr_id].append(e.child_wr_id)

        for nid, children in adj.items():
            for c in children:
                if c in in_degree:
                    in_degree[c] += 1

        q = [nid for nid, deg in in_degree.items() if deg == 0]
        topo_order: List[str] = []

        while q:
            nid = q.pop(0)
            topo_order.append(nid)
            for child in adj.get(nid, []):
                in_degree[child] -= 1
                if in_degree[child] == 0:
                    q.append(child)

        node_receipts: Dict[str, HierarchicalExecutionReceipt] = {}
        now = datetime.utcnow()

        for nid in reversed(topo_order):
            node = self._dag.nodes.get(nid)
            if node is None:
                node_receipts[nid] = self._make_receipt(
                    nid, ExecutionResult.FAILED, error=f"Node {nid} not found in DAG", now=now,
                )
                continue

            terminal = self._receipt_terminal(node, now)
            if terminal is not None:
                node_receipts[nid] = terminal
                continue

            child_ids = self._get_child_ids(node)
            child_receipts = [node_receipts[cid] for cid in child_ids if cid in node_receipts]

            blocked = False
            for cr in child_receipts:
                if cr.result == ExecutionResult.FAILED:
                    node_receipts[nid] = self._make_receipt(
                        nid, ExecutionResult.BLOCKED, children=child_receipts,
                        error=f"Child {cr.node_id} failed: {cr.error}", now=now,
                    )
                    blocked = True
                    break
                if cr.result == ExecutionResult.BLOCKED:
                    node_receipts[nid] = self._make_receipt(
                        nid, ExecutionResult.BLOCKED, children=child_receipts,
                        error=f"Child {cr.node_id} is blocked: {cr.error}", now=now,
                    )
                    blocked = True
                    break

            if not blocked:
                is_critique = node.status in (
                    "PLAN_REVIEW", "CRITIQUE", "VALIDATION", "PLAN_APPROVAL_GATE",
                )
                if is_critique:
                    for cr in child_receipts:
                        cr.metadata["critique_propagated"] = True

                node_receipts[nid] = self._make_receipt(
                    nid, ExecutionResult.PENDING, children=child_receipts, now=now,
                )

                if self._context.mode == ExecutionMode.EXPERIMENTAL:
                    self._apply_probabilistic_policies(nid, node_receipts[nid])

        return node_receipts.get(
            self._dag.root_wr_id,
            self._make_receipt(self._dag.root_wr_id, ExecutionResult.FAILED,
                               error="Root not in topological order", now=now),
        )

    # ── Helpers ─────────────────────────────────────────────────────

    def _get_child_ids(self, node: WorkRequestNode) -> List[str]:
        child_ids = list(node.children) if node.children else []
        for e in self._dag.edges:
            if e.parent_wr_id == node.wr_id and e.child_wr_id not in child_ids:
                child_ids.append(e.child_wr_id)
        return child_ids

    def _apply_probabilistic_policies(
        self, node_id: str, receipt: HierarchicalExecutionReceipt,
    ) -> None:
        node = self._dag.nodes.get(node_id)
        if node is None:
            return
        policies = node.compiled_properties.get("policies", [])
        if not isinstance(policies, list):
            return
        prob_policies = [p for p in policies if isinstance(p, str) and p.startswith("prob_")]
        if prob_policies:
            receipt.metadata["probabilistic_policies"] = prob_policies
            receipt.metadata["experimental"] = True


__all__ = [
    "TraversalStrategy",
    "ExecutionMode",
    "ExecutionResult",
    "ExecutionContext",
    "HierarchicalExecutionReceipt",
    "ProbabilisticPolicy",
    "TraversalEngine",
]
