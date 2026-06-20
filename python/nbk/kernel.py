"""
Nexus Bootstrap Kernel (NBK).

A minimal causal graph interpreter with five abilities:
execute, observe, replay, query, and rewrite itself.

The kernel owns a causal computation graph G = (V, E) where:
    V = execution nodes (pure state transformations)
    E = causal edges (dependency constraints)

Execution is constrained topological traversal over G, respecting
lease bindings and recording traces for replay.
"""

from __future__ import annotations

import itertools
from collections import deque
from typing import Any

from nbk.core import (
    Edge,
    Lease,
    NodeDef,
    NodeFn,
    Trace,
    make_address,
    parse_address,
)


class NexusBootstrapKernel:
    """A self-modifying causal graph execution engine.

    Usage::

        k = NexusBootstrapKernel(realm="dev", graph="my-pipeline")

        k.add_node("extract", extract_fn)
        k.add_node("transform", transform_fn)
        k.add_edge("extract", "transform")

        k.schedule_leases()          # assign executors
        n = k.execute_ready_nodes()  # run one tick
        k.replay()                   # reconstruct state from traces
    """

    def __init__(self, realm: str = "default", graph: str = "default") -> None:
        # ── Graph ────────────────────────────────────────────────────
        self._nodes: dict[str, NodeDef] = {}
        self._edges: list[Edge] = []
        self._outgoing: dict[str, list[str]] = {}   # node → dependents
        self._incoming: dict[str, list[str]] = {}   # node → dependencies

        # ── Execution state ──────────────────────────────────────────
        self._node_states: dict[str, Any] = {}      # latest output per node
        self._sequence: int = 0

        # ── Trace log ────────────────────────────────────────────────
        self.traces: list[Trace] = []

        # ── Lease registry ───────────────────────────────────────────
        self.leases: dict[str, str] = {}             # node_id → executor_id

        # ── Identity ─────────────────────────────────────────────────
        self.realm = realm
        self.graph = graph
        self._trajectory_counter: int = 0

    # ── Graph building ────────────────────────────────────────────────

    def add_node(self, node_id: str, fn: NodeFn, **metadata: Any) -> NodeDef:
        """Register a computation node."""
        if node_id in self._nodes:
            raise ValueError(f"Node {node_id!r} already exists")
        nd = NodeDef(id=node_id, fn=fn, metadata=metadata)
        self._nodes[node_id] = nd
        self._outgoing.setdefault(node_id, [])
        self._incoming.setdefault(node_id, [])
        return nd

    def add_edge(self, from_id: str, to_id: str) -> Edge:
        """Add a causal dependency: ``to_id`` needs ``from_id`` first."""
        self._require_node(from_id)
        self._require_node(to_id)
        if from_id == to_id:
            raise ValueError("Self-loops are not allowed")
        # Check for cycles (basic: ensure we don't create one)
        if self._would_cycle(to_id, from_id):
            raise ValueError(
                f"Adding {from_id}→{to_id} would create a cycle"
            )
        e = Edge(from_id=from_id, to_id=to_id)
        self._edges.append(e)
        self._outgoing[from_id].append(to_id)
        self._incoming[to_id].append(from_id)
        return e

    # ── Graph introspection ───────────────────────────────────────────

    @property
    def nodes(self) -> dict[str, NodeDef]:
        return dict(self._nodes)

    @property
    def edges(self) -> list[Edge]:
        return list(self._edges)

    @property
    def node_states(self) -> dict[str, Any]:
        return dict(self._node_states)

    def get_node(self, node_id: str) -> NodeDef | None:
        return self._nodes.get(node_id)

    def dependencies(self, node_id: str) -> list[str]:
        """Return the node IDs that ``node_id`` depends on."""
        return list(self._incoming.get(node_id, []))

    def dependents(self, node_id: str) -> list[str]:
        """Return nodes that depend on ``node_id``."""
        return list(self._outgoing.get(node_id, []))

    def dependencies_satisfied(self, node_id: str) -> bool:
        """Check if all upstream dependencies have been computed."""
        return all(
            dep in self._node_states
            for dep in self._incoming.get(node_id, [])
        )

    def lease_valid(self, node_id: str) -> bool:
        """Check if the node has a valid lease binding."""
        return node_id in self.leases

    def ready_nodes(self) -> list[str]:
        """Return nodes that are ready to execute (deps met + lease valid)."""
        return [
            nid
            for nid in self._nodes
            if (
                nid not in self._node_states
                and self.dependencies_satisfied(nid)
                and self.lease_valid(nid)
            )
        ]

    # ── Execution ─────────────────────────────────────────────────────

    def resolve_inputs(self, node_id: str) -> dict[str, Any]:
        """Gather the output states of all upstream dependencies."""
        return {
            dep: self._node_states[dep]
            for dep in self._incoming.get(node_id, [])
        }

    def execute_ready_nodes(self) -> int:
        """Execute all ready nodes (topological tick).

        Returns the number of nodes executed this tick.
        """
        executed = 0
        while True:
            batch = self.ready_nodes()
            if not batch:
                break
            # Execute in deterministic order (sorted by id)
            for nid in sorted(batch):
                self._execute_one(nid)
                executed += 1
        return executed

    def execute_node(self, node_id: str) -> Any:
        """Force-execute a single node (bypasses readiness check).

        Useful for testing or for nodes with manual execution policy.
        """
        self._require_node(node_id)
        return self._execute_one(node_id)

    def _execute_one(self, node_id: str) -> Any:
        nd = self._nodes[node_id]
        inputs = self.resolve_inputs(node_id)
        output = nd.fn(inputs)
        self._node_states[node_id] = output
        trace = Trace(
            sequence=self._sequence,
            node_id=node_id,
            input_state=inputs,
            output_state=output,
        )
        self.traces.append(trace)
        self._sequence += 1
        return output

    # ── Replay ────────────────────────────────────────────────────────

    def replay(self) -> dict[str, Any]:
        """Reconstruct the full state by replaying all traces in order.

        Returns the final state dict (node_id → output).
        """
        state: dict[str, Any] = {}
        for tr in self.traces:
            state[tr.node_id] = tr.output_state
        return state

    # ── Lease scheduling ──────────────────────────────────────────────

    def schedule_leases(
        self,
        executors: list[str] | None = None,
        strategy: str = "round_robin",
    ) -> None:
        """Assign every unleased node to an executor."""
        if executors is None:
            executors = ["executor-0"]
        unleased = [
            nid for nid in self._nodes if nid not in self.leases
        ]
        if strategy == "round_robin":
            for i, nid in enumerate(sorted(unleased)):
                self.leases[nid] = executors[i % len(executors)]
        else:
            for nid in unleased:
                self.leases[nid] = executors[0]

    def add_lease(self, node_id: str, executor_id: str) -> Lease:
        """Manually bind a node to an executor."""
        self._require_node(node_id)
        l = Lease(node_id=node_id, executor_id=executor_id)
        self.leases[node_id] = executor_id
        return l

    # ── CAL addressing ────────────────────────────────────────────────

    def address_of(
        self,
        node_id: str,
        trajectory: str | None = None,
    ) -> str:
        """Return the CAL address for a given node."""
        self._require_node(node_id)
        traj = trajectory or f"t{self._trajectory_counter}"
        ver = self._node_states.get(node_id)
        version = (
            str(hash(str(ver)) & 0xFFFFFFFFF)
            if ver is not None
            else "uncomputed"
        )
        return make_address(
            realm=self.realm,
            graph=self.graph,
            trajectory=traj,
            node_id=node_id,
            version=version,
        )

    def resolve(self, address: str) -> NodeDef | None:
        """Resolve a CAL address to the underlying node definition."""
        parts = parse_address(address)
        if parts is None:
            return None
        return self._nodes.get(parts["node_id"])

    # ── SCQL — basic predicate query ──────────────────────────────────

    def query(
        self,
        predicate=None,
    ) -> list[dict[str, Any]]:
        """Query the execution graph.

        Parameters
        ----------
        predicate : callable or None
            A function ``(node_id, node_def, state) → bool``.
            If None, returns all nodes.

        Returns
        -------
        list[dict]
            Matching rows with keys: node_id, metadata, state, lease,
            deps, dependents.
        """
        rows: list[dict[str, Any]] = []
        for nid, nd in self._nodes.items():
            state = self._node_states.get(nid)
            row = {
                "node_id": nid,
                "metadata": nd.metadata,
                "state": state,
                "lease": self.leases.get(nid),
                "deps": self.dependencies(nid),
                "dependents": self.dependents(nid),
                "executed": nid in self._node_states,
            }
            if predicate is None or predicate(nid, nd, state):
                rows.append(row)
        return rows

    # ── Mutation rules (SOCO) ─────────────────────────────────────────

    def mutate(self, rule: MutationRule) -> list[str]:
        """Apply a mutation rule and return the list of affected node ids."""
        affected: list[str] = []
        for nid in list(self._nodes.keys()):
            if rule.applies(nid, self._nodes[nid], self):
                changes = rule.apply(nid, self)
                affected.extend(changes)
        return affected

    # ── Lifecycle ─────────────────────────────────────────────────────

    def run_cycle(self, max_iterations: int = 1) -> int:
        """Run the execute → query → mutate loop.

        Returns total nodes executed.
        """
        total = 0
        for _ in range(max_iterations):
            n = self.execute_ready_nodes()
            total += n
        return total

    def reset(self) -> None:
        """Clear execution state but keep graph structure."""
        self._node_states.clear()
        self.traces.clear()
        self._sequence = 0

    def snapshot(self) -> dict[str, Any]:
        """Return a serialisable snapshot of current kernel state."""
        return {
            "realm": self.realm,
            "graph": self.graph,
            "nodes": list(self._nodes.keys()),
            "edges": [(e.from_id, e.to_id) for e in self._edges],
            "node_states": {
                k: v for k, v in self._node_states.items()
            },
            "traces": len(self.traces),
            "leases": dict(self.leases),
            "sequence": self._sequence,
        }

    # ── Internal helpers ──────────────────────────────────────────────

    def _require_node(self, node_id: str) -> None:
        if node_id not in self._nodes:
            raise KeyError(f"Node {node_id!r} not found in graph")

    def _would_cycle(self, start: str, target: str) -> bool:
        """BFS from start — if we reach target, adding edge would cycle."""
        visited: set[str] = set()
        queue: deque[str] = deque([start])
        while queue:
            current = queue.popleft()
            if current == target:
                return True
            if current in visited:
                continue
            visited.add(current)
            queue.extend(self._outgoing.get(current, []))
        return False


# ── Mutation rule protocol ────────────────────────────────────────────

class MutationRule:
    """Base class for graph mutation rules (SOCO layer)."""

    def applies(self, node_id: str, node: NodeDef, kernel: NexusBootstrapKernel) -> bool:
        """Return True if this rule should be applied to the given node."""
        return False

    def apply(self, node_id: str, kernel: NexusBootstrapKernel) -> list[str]:
        """Apply the rule to the kernel.

        Returns list of affected node IDs.
        """
        raise NotImplementedError
