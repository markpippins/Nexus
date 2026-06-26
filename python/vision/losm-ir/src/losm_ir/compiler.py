"""
WRP v1.1 — 6-Pass Deterministic Compilation Pipeline

Transforms a flat WorkRequest into a validated, annotated WorkRequestDAG.

Passes:
  1. NORMALIZE          — Coerce flat WRs into DAG-compatible form
  2. TENANT_BIND        — Assign tenant_id, trace_id from context
  3. DAG_CONSTRUCT      — Build node/edge graph from parent refs + explicit edges
  4. STRUCTURAL_VALIDATE — DFS cycle detection, orphan check, depth limits
  5. EXECUTION_COMPATIBILITY — Verify all nodes have valid executor config
  6. POLICY_ANNOTATE    — Annotate each node with applicable policies
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from losm_ir.dag import (
    CompilationPass,
    CompilationResult,
    CycleInfo,
    DAGEdge,
    DAGPath,
    EdgeType,
    EventEnvelope,
    StructuralValidationIssue,
    WorkRequestDAG,
    WorkRequestNode,
)
from losm_ir.states import WorkStatus


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.utcnow()


def _new_id() -> str:
    return str(uuid.uuid4())


# ═════════════════════════════════════════════════════════════════════════════
#  Pass 1: NORMALIZE
# ═════════════════════════════════════════════════════════════════════════════

def pass_normalize(
    raw_nodes: List[Dict[str, Any]],
    raw_edges: List[Dict[str, Any]],
) -> Tuple[List[WorkRequestNode], List[DAGEdge], List[str]]:
    """Pass 1 — Normalize.

    Coerce raw flat work requests + edges into canonical DAG form:
      - Ensure every node has a wr_id
      - Set default fields (status=NEW, priority=5, depth=0)
      - Deduplicate nodes by wr_id
      - Remove self-referencing edges
      - Validate edge types
    """
    warnings: List[str] = []
    node_map: Dict[str, WorkRequestNode] = {}

    for raw in raw_nodes:
        wr_id = raw.get("wr_id") or raw.get("id")
        if not wr_id:
            warnings.append("Skipping node without wr_id/id")
            continue

        node = WorkRequestNode(
            wr_id=str(wr_id),
            parent_request_id=raw.get("parent_request_id"),
            intent=raw.get("intent") or "",
            status=raw.get("status") or "NEW",
            priority=int(raw.get("priority", 5)),
            depth=int(raw.get("depth", 0)),
            children=raw.get("children") or [],
            edge_type=raw.get("edge_type"),
            metadata=raw.get("metadata") or {},
        )

        if wr_id in node_map:
            warnings.append(f"Duplicate node {wr_id} — first wins")
        else:
            node_map[wr_id] = node

    normalized_edges: List[DAGEdge] = []
    for raw in raw_edges:
        parent = str(raw.get("parent_wr_id", ""))
        child = str(raw.get("child_wr_id", ""))
        if not parent or not child:
            warnings.append("Skipping edge without parent_wr_id or child_wr_id")
            continue
        if parent == child:
            warnings.append(f"Self-referencing edge skipped: {parent}→{parent}")
            continue

        try:
            etype = EdgeType(raw.get("edge_type", "depends_on"))
        except ValueError:
            etype = EdgeType.DEPENDS_ON
            warnings.append(f"Unknown edge_type {raw.get('edge_type')!r}, defaulting to depends_on")

        normalized_edges.append(DAGEdge(
            edge_id=raw.get("edge_id") or _new_id(),
            parent_wr_id=parent,
            child_wr_id=child,
            edge_type=etype,
            metadata=raw.get("metadata") or {},
            created_at=raw.get("created_at") or _now(),
        ))

    return list(node_map.values()), normalized_edges, warnings


# ═════════════════════════════════════════════════════════════════════════════
#  Pass 2: TENANT BIND
# ═════════════════════════════════════════════════════════════════════════════

def pass_tenant_bind(
    nodes: List[WorkRequestNode],
    envelope: Optional[EventEnvelope] = None,
    tenant_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    kernel_id: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str], Optional[str], List[str]]:
    """Pass 2 — Tenant Binding.

    Resolve tenant_id, trace_id, kernel_id from:
      1. The EventEnvelope (if provided)
      2. Node metadata (per-node override)
      3. Top-level defaults
    """
    warnings: List[str] = []
    t_id = tenant_id
    tr_id = trace_id
    k_id = kernel_id

    if envelope:
        t_id = t_id or envelope.tenant_id
        tr_id = tr_id or envelope.trace_id
        k_id = k_id or envelope.kernel_id

    # Check node-level metadata for tenant overrides
    for node in nodes:
        node_t = node.metadata.get("tenant_id") or t_id
        node_tr = node.metadata.get("trace_id") or tr_id
        node_k = node.metadata.get("kernel_id") or k_id

        if node_t:
            node.metadata["tenant_id"] = node_t
        if node_tr:
            node.metadata["trace_id"] = node_tr
        if node_k:
            node.metadata["kernel_id"] = node_k

    if not t_id:
        warnings.append("No tenant_id resolved — DAG will be unbound")
    if not tr_id:
        warnings.append("No trace_id resolved")

    return t_id, tr_id, k_id, warnings


# ═════════════════════════════════════════════════════════════════════════════
#  Pass 3: DAG CONSTRUCT
# ═════════════════════════════════════════════════════════════════════════════

def _build_adjacency(nodes: List[WorkRequestNode], edges: List[DAGEdge]) -> Dict[str, List[str]]:
    """Build adjacency list (parent → children) from edges + parent_request_id."""
    adj: Dict[str, List[str]] = {}
    node_ids = {n.wr_id for n in nodes}

    # From explicit edges
    for e in edges:
        if e.parent_wr_id not in adj:
            adj[e.parent_wr_id] = []
        if e.child_wr_id in node_ids:
            adj[e.parent_wr_id].append(e.child_wr_id)

    # From parent_request_id (denormalized shortcut)
    for n in nodes:
        if n.parent_request_id:
            p = n.parent_request_id
            if p not in adj:
                adj[p] = []
            if n.wr_id not in adj.get(p, []):
                adj[p].append(n.wr_id)

    return adj


def _compute_depth(
    node_id: str,
    adj: Dict[str, List[str]],
    depth_cache: Dict[str, int],
    visited: Set[str],
    max_depth: int = 1000,
) -> int:
    """Compute depth from root via BFS/DFS.  Root nodes have depth 0."""
    if node_id in depth_cache:
        return depth_cache[node_id]
    if node_id in visited:
        return 0  # cycle guard
    visited.add(node_id)

    max_d = 0
    # Find parents (nodes that point TO this node)
    for parent, children in adj.items():
        if node_id in children:
            d = _compute_depth(parent, adj, depth_cache, visited, max_depth) + 1
            if d > max_d:
                max_d = d

    depth_cache[node_id] = min(max_d, max_depth)
    return depth_cache[node_id]


def _find_root(nodes: List[WorkRequestNode], adj: Dict[str, List[str]]) -> Optional[str]:
    """Find the root node — a node with no incoming edges and no parent."""
    all_nodes = {n.wr_id for n in nodes}
    has_incoming: Set[str] = set()
    for parent, children in adj.items():
        for c in children:
            has_incoming.add(c)

    # Also check parent_request_id for incoming
    for n in nodes:
        if n.parent_request_id:
            has_incoming.add(n.wr_id)

    roots = all_nodes - has_incoming
    if not roots:
        return None
    return min(roots)  # deterministic pick


def pass_dag_construct(
    nodes: List[WorkRequestNode],
    raw_edges: List[DAGEdge],
) -> Tuple[WorkRequestDAG, List[str]]:
    """Pass 3 — DAG Construction.

    Build the full WorkRequestDAG from normalized nodes and edges:
      - Resolve parent_request_id into edges
      - Compute depth for each node via DFS
      - Build adjacency list
      - Find root node
    """
    warnings: List[str] = []

    # Build adjacency
    adj = _build_adjacency(nodes, raw_edges)

    # Compute depth
    depth_cache: Dict[str, int] = {}
    for n in nodes:
        n.depth = _compute_depth(n.wr_id, adj, depth_cache, set())

    # Build children lists
    for n in nodes:
        n.children = adj.get(n.wr_id, [])

    # Find root
    root_id = _find_root(nodes, adj)

    if not root_id and nodes:
        warnings.append("No root node found — DAG may be cyclic or disconnected")
        root_id = nodes[0].wr_id if nodes else _new_id()
    elif not root_id and not nodes:
        root_id = _new_id()
        warnings.append("Empty DAG — created placeholder root")

    # Build node map
    node_map: Dict[str, WorkRequestNode] = {n.wr_id: n for n in nodes}

    # Deduplicate edges
    seen_edges: Set[Tuple[str, str, str]] = set()
    unique_edges: List[DAGEdge] = []
    for e in raw_edges:
        key = (e.parent_wr_id, e.child_wr_id, e.edge_type.value)
        if key not in seen_edges:
            seen_edges.add(key)
            unique_edges.append(e)

    max_depth = max((n.depth for n in nodes), default=0)

    dag = WorkRequestDAG(
        dag_id=_new_id(),
        root_wr_id=root_id if root_id else "",
        nodes=node_map,
        edges=unique_edges,
        depth=max_depth,
        total_nodes=len(nodes),
        compilation_status="constructed",
        compiled_at=_now(),
    )

    return dag, warnings


# ═════════════════════════════════════════════════════════════════════════════
#  Pass 4: STRUCTURAL VALIDATE
# ═════════════════════════════════════════════════════════════════════════════

def _detect_cycles(adj: Dict[str, List[str]]) -> CycleInfo:
    """DFS-based cycle detection."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color: Dict[str, int] = {}
    parent: Dict[str, Optional[str]] = {}

    for node in adj:
        color[node] = WHITE
        parent[node] = None

    cycle_nodes: Set[str] = set()
    cycle_path: List[str] = []

    def dfs(u: str) -> bool:
        color[u] = GRAY
        for v in adj.get(u, []):
            if v not in color:
                color[v] = WHITE
                parent[v] = None
            if color[v] == GRAY:
                # Cycle detected — reconstruct path
                cycle_nodes.add(u)
                cycle_nodes.add(v)
                cycle_path.append(v)
                cycle_path.append(u)
                return True
            if color[v] == WHITE:
                parent[v] = u
                if dfs(v):
                    return True
        color[u] = BLACK
        return False

    for node in list(adj.keys()):
        if color.get(node) == WHITE:
            dfs(node)

    return CycleInfo(
        has_cycle=len(cycle_nodes) > 0,
        cycle_nodes=list(cycle_nodes),
        cycle_path=cycle_path,
    )


MAX_DAG_DEPTH = 50


def pass_structural_validate(dag: WorkRequestDAG) -> Tuple[List[StructuralValidationIssue], List[str]]:
    """Pass 4 — Structural Validation.

    Checks:
      - Cycle detection (DFS)
      - Orphan detection (nodes outside the root tree)
      - Depth constraint violation
      - Duplicate edge detection
      - Missing parent references
    """
    issues: List[StructuralValidationIssue] = []
    warnings: List[str] = []

    adj = _build_adjacency(list(dag.nodes.values()), dag.edges)

    # 1. Cycle detection
    cycle_info = _detect_cycles(adj)
    if cycle_info.has_cycle:
        issues.append(StructuralValidationIssue(
            wr_id="DAG",
            issue_type="cycle",
            message=f"Cycle detected involving {len(cycle_info.cycle_nodes)} nodes",
            detail={"cycle_nodes": cycle_info.cycle_nodes, "cycle_path": cycle_info.cycle_path},
        ))
        warnings.append(f"Cycle detected: {cycle_info.cycle_path}")

    # 2. Depth constraint
    for node in dag.nodes.values():
        if node.depth > MAX_DAG_DEPTH:
            issues.append(StructuralValidationIssue(
                wr_id=node.wr_id,
                issue_type="depth_exceeded",
                message=f"Node depth {node.depth} exceeds max {MAX_DAG_DEPTH}",
                detail={"depth": node.depth, "max_depth": MAX_DAG_DEPTH},
            ))

    # 3. Orphan detection
    reachable: Set[str] = set()
    stack = [dag.root_wr_id]
    while stack:
        nid = stack.pop()
        if nid in reachable:
            continue
        reachable.add(nid)
        for c in adj.get(nid, []):
            stack.append(c)

    for nid in dag.nodes:
        if nid not in reachable:
            issues.append(StructuralValidationIssue(
                wr_id=nid,
                issue_type="orphan",
                message=f"Node {nid} is not reachable from root {dag.root_wr_id}",
                detail={"root_wr_id": dag.root_wr_id},
            ))

    # 4. Duplicate edge detection
    seen: Set[Tuple[str, str, str]] = set()
    for e in dag.edges:
        key = (e.parent_wr_id, e.child_wr_id, e.edge_type.value)
        if key in seen:
            issues.append(StructuralValidationIssue(
                wr_id=f"{e.parent_wr_id}→{e.child_wr_id}",
                issue_type="duplicate_edge",
                message=f"Duplicate edge {e.parent_wr_id}→{e.child_wr_id} ({e.edge_type})",
                detail={"parent": e.parent_wr_id, "child": e.child_wr_id, "edge_type": e.edge_type.value},
            ))
        seen.add(key)

    # 5. Missing parent
    all_node_ids = set(dag.nodes.keys())
    for e in dag.edges:
        if e.parent_wr_id not in all_node_ids:
            issues.append(StructuralValidationIssue(
                wr_id=e.parent_wr_id,
                issue_type="missing_parent",
                message=f"Edge parent {e.parent_wr_id} not found in nodes",
                detail={"child": e.child_wr_id},
            ))
        if e.child_wr_id not in all_node_ids:
            issues.append(StructuralValidationIssue(
                wr_id=e.child_wr_id,
                issue_type="missing_parent",
                message=f"Edge child {e.child_wr_id} not found in nodes",
                detail={"parent": e.parent_wr_id},
            ))

    return issues, warnings


# ═════════════════════════════════════════════════════════════════════════════
#  Pass 5: EXECUTION COMPATIBILITY
# ═════════════════════════════════════════════════════════════════════════════

def pass_execution_compatibility(dag: WorkRequestDAG) -> Tuple[List[str], List[str]]:
    """Pass 5 — Execution Compatibility.

    Verify all nodes have valid executor configuration:
      - Each node must have a known executor type or be a pure orchestration node
      - Orchestration nodes (status=COMPLETION) need no executor
      - Warn on nodes with incompatible status→executor mappings
    """
    errors: List[str] = []
    warnings: List[str] = []

    KNOWN_EXECUTORS = {
        "planner", "builder", "reviewer", "analyst",
        "critic", "inspector", "architect", "archivist",
    }

    for node in dag.nodes.values():
        executor = node.metadata.get("executor", "").lower()
        status = node.status

        # COMPLETION/BLOCKED/FAILED statuses don't need executors
        if status in ("COMPLETION", "BLOCKED", "FAILED", "COMPLETE"):
            continue

        # Orchestration nodes (NEW, INTAKE, PLAN_*) need executors
        if not executor:
            errors.append(f"Node {node.wr_id} (status={status}) has no executor assigned")
        elif executor not in KNOWN_EXECUTORS:
            warnings.append(f"Node {node.wr_id}: unknown executor {executor!r}")

        # Check status sanity
        if node.depth > 0 and status == "NEW" and not executor:
            warnings.append(f"Non-root node {node.wr_id} is NEW with no executor — may be inert")

    return errors, warnings


# ═════════════════════════════════════════════════════════════════════════════
#  Pass 6: POLICY ANNOTATE
# ═════════════════════════════════════════════════════════════════════════════

def pass_policy_annotate(dag: WorkRequestDAG) -> Tuple[Dict[str, List[str]], List[str]]:
    """Pass 6 — Policy Annotation.

    Annotate each node with applicable governance policies:
      - Root nodes get 'root_governance' policy
      - Leaf nodes get 'leaf_optimization' policy
      - Nodes with BLOCKED/FAILED status get 'recovery_required' policy
      - Branch nodes get 'branch_tracking' policy
    """
    annotations: Dict[str, List[str]] = {}
    warnings: List[str] = []

    all_node_ids = set(dag.nodes.keys())
    children_of: Dict[str, List[str]] = {}
    for e in dag.edges:
        if e.parent_wr_id not in children_of:
            children_of[e.parent_wr_id] = []
        children_of[e.parent_wr_id].append(e.child_wr_id)

    for node in dag.nodes.values():
        policies: List[str] = []

        # Root governance
        if node.depth == 0:
            policies.append("root_governance")

        # Leaf optimization
        nid = node.wr_id
        has_children = bool(children_of.get(nid)) or bool(node.children)
        if not has_children:
            policies.append("leaf_optimization")

        # Recovery
        if node.status in ("BLOCKED", "FAILED"):
            policies.append("recovery_required")

        # Branch tracking
        if node.metadata.get("branch_id"):
            policies.append("branch_tracking")

        # Tenant isolation
        if node.metadata.get("tenant_id"):
            policies.append("tenant_isolation")

        # Depth-based escalation
        if node.depth >= 10:
            policies.append("deep_nesting_escalation")

        if policies:
            annotations[node.wr_id] = policies
            node.compiled_properties["policies"] = policies

    return annotations, warnings


# ═════════════════════════════════════════════════════════════════════════════
#  Composite: compile() — run all 6 passes
# ═════════════════════════════════════════════════════════════════════════════

def compile_dag(
    raw_nodes: List[Dict[str, Any]],
    raw_edges: Optional[List[Dict[str, Any]]] = None,
    envelope: Optional[EventEnvelope] = None,
    tenant_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    kernel_id: Optional[str] = None,
    stop_on_error: bool = False,
) -> CompilationResult:
    """Run all 6 compilation passes in order.

    Args:
        raw_nodes: List of flat work request dicts (must have wr_id).
        raw_edges: Optional list of edge dicts.
        envelope: Optional EventEnvelope for routing context.
        tenant_id, trace_id, kernel_id: Top-level scoping.
        stop_on_error: If True, stop at the first pass that produces errors.

    Returns:
        CompilationResult with the final DAG (or partial DAG on error).
    """
    all_errors: List[str] = []
    all_warnings: List[str] = []
    raw_edges = raw_edges or []
    overall_start = time.monotonic()

    # ── Pass 1: Normalize ────────────────────────────────────────────
    p1_start = time.monotonic()
    nodes, edges, p1_warnings = pass_normalize(raw_nodes, raw_edges)
    p1_dur = (time.monotonic() - p1_start) * 1000
    all_warnings.extend([f"[NORMALIZE] {w}" for w in p1_warnings])

    if not nodes:
        return CompilationResult(
            success=False,
            errors=["No valid nodes after normalization"],
            warnings=all_warnings,
            pass_name=CompilationPass.NORMALIZE,
            duration_ms=(time.monotonic() - overall_start) * 1000,
        )

    if stop_on_error and not nodes:
        return CompilationResult(success=False, errors=all_errors, warnings=all_warnings,
                                  pass_name=CompilationPass.NORMALIZE)

    # ── Pass 2: Tenant Bind ─────────────────────────────────────────
    p2_start = time.monotonic()
    t_id, tr_id, k_id, p2_warnings = pass_tenant_bind(
        nodes, envelope, tenant_id, trace_id, kernel_id,
    )
    p2_dur = (time.monotonic() - p2_start) * 1000
    all_warnings.extend([f"[TENANT_BIND] {w}" for w in p2_warnings])

    # ── Pass 3: DAG Construct ────────────────────────────────────────
    p3_start = time.monotonic()
    dag, p3_warnings = pass_dag_construct(nodes, edges)
    p3_dur = (time.monotonic() - p3_start) * 1000
    all_warnings.extend([f"[DAG_CONSTRUCT] {w}" for w in p3_warnings])
    dag.tenant_id = t_id
    dag.trace_id = tr_id
    dag.kernel_id = k_id

    # ── Pass 4: Structural Validate ─────────────────────────────────
    p4_start = time.monotonic()
    structural_issues, p4_warnings = pass_structural_validate(dag)
    p4_dur = (time.monotonic() - p4_start) * 1000
    all_warnings.extend([f"[STRUCTURAL_VALIDATE] {w}" for w in p4_warnings])

    for issue in structural_issues:
        msg = f"[VALIDATE] {issue.issue_type}: {issue.message}"
        if issue.issue_type in ("cycle", "missing_parent"):
            all_errors.append(msg)
        else:
            all_warnings.append(msg)

    dag.metadata["structural_issues"] = [i.model_dump() for i in structural_issues]

    if stop_on_error and all_errors:
        dag.compilation_status = "failed_validation"
        dag.compilation_errors = all_errors
        return CompilationResult(
            success=False, dag=dag, errors=all_errors, warnings=all_warnings,
            pass_name=CompilationPass.STRUCTURAL_VALIDATE,
            duration_ms=(time.monotonic() - overall_start) * 1000,
        )

    # ── Pass 5: Execution Compatibility ─────────────────────────────
    p5_start = time.monotonic()
    compat_errors, p5_warnings = pass_execution_compatibility(dag)
    p5_dur = (time.monotonic() - p5_start) * 1000
    all_errors.extend([f"[EXECUTION_COMPAT] {e}" for e in compat_errors])
    all_warnings.extend([f"[EXECUTION_COMPAT] {w}" for w in p5_warnings])

    if stop_on_error and compat_errors:
        dag.compilation_status = "failed_compatibility"
        dag.compilation_errors = all_errors
        return CompilationResult(
            success=False, dag=dag, errors=all_errors, warnings=all_warnings,
            pass_name=CompilationPass.EXECUTION_COMPATIBILITY,
            duration_ms=(time.monotonic() - overall_start) * 1000,
        )

    # ── Pass 6: Policy Annotate ──────────────────────────────────────
    p6_start = time.monotonic()
    annotations, p6_warnings = pass_policy_annotate(dag)
    p6_dur = (time.monotonic() - p6_start) * 1000
    all_warnings.extend([f"[POLICY_ANNOTATE] {w}" for w in p6_warnings])
    dag.metadata["policy_annotations"] = annotations

    # ── Finalize ─────────────────────────────────────────────────────
    total_dur = (time.monotonic() - overall_start) * 1000
    dag.compilation_status = "compiled" if not all_errors else "compiled_with_warnings"
    dag.compiled_at = _now()

    return CompilationResult(
        success=len(all_errors) == 0,
        dag=dag,
        errors=all_errors,
        warnings=all_warnings,
        pass_name=None,  # all passes ran
        duration_ms=total_dur,
    )


# ── DAG Query Helpers ─────────────────────────────────────────────────────────

def find_shortest_path(
    dag: WorkRequestDAG,
    source_wr_id: str,
    target_wr_id: str,
) -> DAGPath:
    """BFS shortest path between two nodes in the DAG."""
    if source_wr_id not in dag.nodes or target_wr_id not in dag.nodes:
        return DAGPath(source_wr_id=source_wr_id, target_wr_id=target_wr_id, exists=False)

    # Build adjacency both directions
    adj_fwd: Dict[str, List[str]] = {}
    for e in dag.edges:
        if e.parent_wr_id not in adj_fwd:
            adj_fwd[e.parent_wr_id] = []
        adj_fwd[e.parent_wr_id].append(e.child_wr_id)
    for nid, node in dag.nodes.items():
        if node.children:
            if nid not in adj_fwd:
                adj_fwd[nid] = []
            adj_fwd[nid].extend([c for c in node.children if c not in adj_fwd.get(nid, [])])

    # BFS
    visited: Set[str] = {source_wr_id}
    queue: List[Tuple[str, List[str]]] = [(source_wr_id, [source_wr_id])]

    while queue:
        current, path = queue.pop(0)
        if current == target_wr_id:
            return DAGPath(
                source_wr_id=source_wr_id,
                target_wr_id=target_wr_id,
                path=path,
                length=len(path) - 1,
                exists=True,
            )
        for neighbor in adj_fwd.get(current, []):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append((neighbor, path + [neighbor]))

    return DAGPath(source_wr_id=source_wr_id, target_wr_id=target_wr_id, exists=False)


def get_subtree(dag: WorkRequestDAG, root_wr_id: str) -> WorkRequestDAG:
    """Extract a subtree rooted at the given node."""
    if root_wr_id not in dag.nodes:
        raise ValueError(f"Node {root_wr_id} not in DAG")

    # BFS to collect nodes in subtree
    sub_node_ids: Set[str] = set()
    queue = [root_wr_id]
    while queue:
        nid = queue.pop(0)
        if nid in sub_node_ids:
            continue
        sub_node_ids.add(nid)
        for c in dag.nodes[nid].children:
            queue.append(c)

    # Filter edges
    sub_edges = [e for e in dag.edges if e.parent_wr_id in sub_node_ids]

    sub_nodes = {nid: dag.nodes[nid] for nid in sub_node_ids}
    max_depth = max((dag.nodes[nid].depth for nid in sub_node_ids), default=0)

    return WorkRequestDAG(
        dag_id=_new_id(),
        root_wr_id=root_wr_id,
        nodes=sub_nodes,
        edges=sub_edges,
        tenant_id=dag.tenant_id,
        trace_id=dag.trace_id,
        kernel_id=dag.kernel_id,
        depth=max_depth - dag.nodes[root_wr_id].depth,
        total_nodes=len(sub_nodes),
        compilation_status="subtree",
        compiled_at=_now(),
    )


__all__ = [
    "compile_dag",
    "find_shortest_path",
    "get_subtree",
    "pass_normalize",
    "pass_tenant_bind",
    "pass_dag_construct",
    "pass_structural_validate",
    "pass_execution_compatibility",
    "pass_policy_annotate",
]
