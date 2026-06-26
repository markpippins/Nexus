"""Lowering Pass + Freeze Boundary — Station 4 of the MEEP pipeline.

Takes a WorkRequestGraph (mutable, structural) and lowers it into an
ExecutionGraph (frozen, executable).  This is the **immutable transition**
boundary — once the graph is lowered, no field may be modified.

Steps performed during lowering:
  1. Resolve each WorkNode to an ExecNode with a registered handler
     reference.
  2. Convert WorkEdges to plain (source_id, target_id) tuples.
  3. Compute topological order using Kahn's algorithm.
  4. Stamp a UTC timestamp (frozen_at).
  5. Freeze the ExecutionGraph — further writes are rejected.

Critical invariant (from the collapse roadmap):
    > Once lowered, an ExecutionGraph is immutable. The scheduler MUST
    > reject any ExecutionGraph that has been modified after lowering.
"""

from __future__ import annotations

import datetime
from collections import deque
from typing import Final

from meep.models import (
    WorkRequestGraph,
    ExecNode,
    ExecutionGraph,
    FrozenGraphError,
)

# ── Handler registry ─────────────────────────────────────────────────
# Maps (archetype, label_key) → handler function name.
# This is a simple string registry for v1 — handlers are resolved by name
# and looked up at execution time.

_HANDLER_MAP: Final[dict[str, dict[str, str]]] = {
    "CONSTRUCTION": {
        "specify": "specify_handler",
        "build": "construct_handler",
        "verify": "verify_handler",
    },
    "EXECUTION": {
        "prepare": "prepare_handler",
        "execute": "execute_handler",
        "collect": "collect_results_handler",
    },
    "REFLECTION": {
        "gather": "gather_context_handler",
        "analyze": "analyze_handler",
        "report": "report_findings_handler",
    },
    "RECONCILIATION": {
        "identify": "identify_conflicts_handler",
        "propose": "propose_resolution_handler",
        "apply": "apply_reconciliation_handler",
    },
    "REVISION": {
        "identify": "identify_issue_handler",
        "plan": "plan_change_handler",
        "apply": "apply_change_handler",
        "verify": "verify_fix_handler",
    },
    "COUNTERFACTUAL": {
        "scenario": "define_scenario_handler",
        "explore": "explore_alternative_handler",
        "compare": "compare_outcomes_handler",
    },
    "AUDIT": {
        "collect": "collect_evidence_handler",
        "evaluate": "evaluate_compliance_handler",
        "report": "report_audit_findings_handler",
    },
    "COMPRESSION": {
        "scan": "scan_input_handler",
        "extract": "extract_key_points_handler",
        "summary": "produce_summary_handler",
    },
    "CONSTRAINT_INJECTION": {
        "analyze": "analyze_constraints_handler",
        "modify": "modify_behavior_handler",
        "validate": "validate_constraints_handler",
    },
    "DEFAULT": {
        "clarify": "clarify_intent_handler",
    },
}

# Fallback handler when no specific mapping exists.
_GENERIC_HANDLER: Final[str] = "generic_handler"


def lower(graph: WorkRequestGraph) -> ExecutionGraph:
    """Lower a *WorkRequestGraph* into a frozen *ExecutionGraph*.

    Args:
        graph: The mutable work request graph from the spec compiler.

    Returns:
        A frozen ExecutionGraph whose content fields cannot be modified.

    Raises:
        ValueError: If the graph contains a cycle.
    """
    if not graph.nodes:
        eg = ExecutionGraph(frozen_at="")
        eg._freeze()
        return eg

    exec_nodes: list[ExecNode] = []
    for node in graph.nodes:
        handler = _resolve_handler(node.archetype, node.id)
        exec_nodes.append(ExecNode(
            id=node.id,
            label=node.label,
            handler=handler,
        ))

    edges = [(e.source_id, e.target_id) for e in graph.edges]
    topo_order = _topological_sort(exec_nodes, edges)

    now = datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )

    exec_graph = ExecutionGraph(
        nodes=exec_nodes,
        edges=edges,
        topological_order=topo_order,
        frozen_at=now,
    )
    exec_graph._freeze()
    return exec_graph


def lower_with_timestamp(graph: WorkRequestGraph,
                         timestamp: str) -> ExecutionGraph:
    """Lower with an explicit timestamp (for deterministic tests)."""
    if not graph.nodes:
        eg = ExecutionGraph(frozen_at=timestamp)
        eg._freeze()
        return eg

    exec_nodes: list[ExecNode] = []
    for node in graph.nodes:
        handler = _resolve_handler(node.archetype, node.id)
        exec_nodes.append(ExecNode(
            id=node.id,
            label=node.label,
            handler=handler,
        ))

    edges = [(e.source_id, e.target_id) for e in graph.edges]
    topo_order = _topological_sort(exec_nodes, edges)

    exec_graph = ExecutionGraph(
        nodes=exec_nodes,
        edges=edges,
        topological_order=topo_order,
        frozen_at=timestamp,
    )
    exec_graph._freeze()
    return exec_graph


def _resolve_handler(archetype: str, node_id: str) -> str:
    """Resolve a WorkNode to a handler function name.

    Extracts the label key from the node id suffix and looks up the
    appropriate handler for the archetype.
    """
    # node_id format: "{archetype}-{label_key}"
    parts = node_id.split("-", 1)
    label_key = parts[1] if len(parts) > 1 else ""

    archetype_handlers = _HANDLER_MAP.get(archetype, {})
    return archetype_handlers.get(label_key, _GENERIC_HANDLER)


def _topological_sort(
    nodes: list[ExecNode],
    edges: list[tuple[str, str]],
) -> list[str]:
    """Compute topological order using Kahn's algorithm.

    Returns:
        Node IDs in topological order (dependency-first).

    Raises:
        ValueError: If the graph contains a cycle.
    """
    in_degree: dict[str, int] = {n.id: 0 for n in nodes}
    adjacency: dict[str, list[str]] = {n.id: [] for n in nodes}

    for source, target in edges:
        adjacency[source].append(target)
        in_degree[target] = in_degree.get(target, 0) + 1

    queue: deque[str] = deque(
        nid for nid, degree in in_degree.items() if degree == 0
    )
    result: list[str] = []

    while queue:
        node_id = queue.popleft()
        result.append(node_id)
        for neighbor in adjacency[node_id]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(result) != len(nodes):
        raise ValueError("Graph contains a cycle — cannot compute topological order")

    return result
