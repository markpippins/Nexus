"""
WRP v1.1 — DAG Data Model

Recursive WorkRequest DAG types used by the 6-pass compilation pipeline.

Design:
  - EventEnvelope wraps every DAG operation with tenant/trace/kernel context
  - WorkRequestNode is a node in the DAG (a WR + its children + state)
  - WorkRequestDAG is the full tree: root, nodes, edges, tenant/trace scope
  - CompilationPass is the base for all 6 compilation passes
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple

from pydantic import BaseModel, Field


# ── EventEnvelope ─────────────────────────────────────────────────────────────

class EventEnvelope(BaseModel):
    """Wraps every DAG operation with routing context.

    Fields:
        event_id: Unique ID for this envelope (UUID).
        wrp_id: The WorkRequest protocol version (e.g. "1.1").
        type: Event type — mirrors the operation being performed.
        timestamp: When the event was emitted.
        version: Event schema version.
        causation_id: ID of the event that *caused* this event.
        correlation_id: ID that groups related events into a conversation.
        tenant_id: Tenant/namespace scope for multi-tenant routing.
        trace_id: Distributed tracing trace ID.
        kernel_id: Logical kernel/execution-unit ID.
    """
    event_id: str
    wrp_id: str = "1.1"
    type: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    version: int = 1
    causation_id: Optional[str] = None
    correlation_id: Optional[str] = None
    tenant_id: Optional[str] = None
    trace_id: Optional[str] = None
    kernel_id: Optional[str] = None

    model_config = {"extra": "allow"}


# ── EdgeType ──────────────────────────────────────────────────────────────────

class EdgeType(str, Enum):
    """Semantic edge types between WorkRequest nodes."""
    DEPENDS_ON = "depends_on"
    PARENT_OF = "parent_of"
    CHILD_OF = "child_of"
    DERIVED_FROM = "derived_from"
    SUPERSEDES = "supersedes"
    BRANCHES_FROM = "branches_from"
    REFERENCES = "references"
    TRIGGERED_BY = "triggered_by"


# ── WorkRequestNode ───────────────────────────────────────────────────────────

class WorkRequestNode(BaseModel):
    """A single node in the WorkRequest DAG.

    Fields:
        wr_id: UUID of this work request (mirrors WorkRequestDCO.id).
        parent_request_id: Optional parent WR UUID (direct lineage).
        intent: Human-readable intent/goal of this work request.
        status: Current operational status (from WorkStatus enum).
        priority: Numeric priority (1-10, higher = more important).
        depth: Depth from root (0 = root node).
        children: Child node WR IDs (from edges / parent refs).
        edge_type: The edge type linking this node to its parent.
        metadata: Arbitrary metadata/key-value annotations.
        compiled_properties: Properties set by the compilation pipeline.
    """
    wr_id: str
    parent_request_id: Optional[str] = None
    intent: str = ""
    status: str = "NEW"
    priority: int = 5
    depth: int = 0
    children: List[str] = Field(default_factory=list)
    edge_type: Optional[EdgeType] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    compiled_properties: Dict[str, Any] = Field(default_factory=dict)

    model_config = {"extra": "allow"}


# ── DAGEdge ───────────────────────────────────────────────────────────────────

class DAGEdge(BaseModel):
    """An explicit edge in the WorkRequest DAG.

    Stored in work_request_edges.  Edges are the canonical representation;
    parent_request_id on the node is a denormalized shortcut.
    """
    edge_id: str
    parent_wr_id: str
    child_wr_id: str
    edge_type: EdgeType = EdgeType.DEPENDS_ON
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ── WorkRequestDAG ────────────────────────────────────────────────────────────

class WorkRequestDAG(BaseModel):
    """The full recursive WorkRequest DAG.

    This is the top-level compiled artifact — a tree (or forest) of
    WorkRequestNodes connected by explicit edges, scoped to a logical
    operation via tenant_id/trace_id.

    Fields:
        dag_id: Unique ID for this DAG instance.
        root_wr_id: The root work request UUID (entry point).
        nodes: All nodes keyed by wr_id.
        edges: All explicit edges.
        tenant_id: Tenant/namespace scope.
        trace_id: Distributed trace ID.
        kernel_id: Logical kernel ID.
        depth: Maximum depth from root.
        total_nodes: Total node count.
        compilation_status: Result of the last compilation run.
        compilation_errors: Errors from the last compilation run.
        compiled_at: When the DAG was last compiled.
        metadata: Arbitrary DAG-level metadata.
    """
    dag_id: str
    root_wr_id: str
    nodes: Dict[str, WorkRequestNode] = Field(default_factory=dict)
    edges: List[DAGEdge] = Field(default_factory=list)
    tenant_id: Optional[str] = None
    trace_id: Optional[str] = None
    kernel_id: Optional[str] = None
    depth: int = 0
    total_nodes: int = 0
    compilation_status: str = "not_compiled"
    compilation_errors: List[str] = Field(default_factory=list)
    compiled_at: Optional[datetime] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    model_config = {"extra": "allow"}


# ── Compilation Passes ────────────────────────────────────────────────────────

class CompilationPass(str, Enum):
    """The 6 deterministic passes of the WRP v1.1 compilation pipeline."""
    NORMALIZE = "normalize"
    TENANT_BIND = "tenant_bind"
    DAG_CONSTRUCT = "dag_construct"
    STRUCTURAL_VALIDATE = "structural_validate"
    EXECUTION_COMPATIBILITY = "execution_compatibility"
    POLICY_ANNOTATE = "policy_annotate"


class CompilationResult(BaseModel):
    """Result of running a single compilation pass (or all 6)."""
    success: bool = True
    dag: Optional[WorkRequestDAG] = None
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    pass_name: Optional[CompilationPass] = None
    duration_ms: Optional[float] = None


# ── Validation Types ──────────────────────────────────────────────────────────

class StructuralValidationIssue(BaseModel):
    """An issue found during structural validation (Pass 4)."""
    wr_id: str
    issue_type: str  # "cycle", "orphan", "depth_exceeded", "duplicate_edge", "missing_parent"
    message: str
    detail: Dict[str, Any] = Field(default_factory=dict)


class CycleInfo(BaseModel):
    """Cycle detection result."""
    has_cycle: bool = False
    cycle_nodes: List[str] = Field(default_factory=list)
    cycle_path: List[str] = Field(default_factory=list)


# ── Path Resolution ───────────────────────────────────────────────────────────

class DAGPath(BaseModel):
    """Resolved path between two nodes in the DAG."""
    source_wr_id: str
    target_wr_id: str
    path: List[str] = Field(default_factory=list)
    length: int = 0
    exists: bool = False


__all__ = [
    "EventEnvelope",
    "EdgeType",
    "WorkRequestNode",
    "DAGEdge",
    "WorkRequestDAG",
    "CompilationPass",
    "CompilationResult",
    "StructuralValidationIssue",
    "CycleInfo",
    "DAGPath",
]
