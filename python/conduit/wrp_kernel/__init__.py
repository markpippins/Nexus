"""
WRP Kernel — deterministic, replayable semantic runtime.

A pure-function state machine that processes KernelDelta batches into
KernelState with identity resolution, graph indexing, and lineage tracking.

Architecture:
  delta.py     — (re-exports KernelDelta/KernelDeltaBatch from nexus_core)
  engine.py    — KernelEngine: 5-step reduce (receipts → identity → graph → lineage → commit)
  identity.py  — IdentityEngine: node_id → identity_id resolution
  graph.py     — GraphIndex: identity-based typed edges
  lineage.py   — LineageEngine: causal event recording
  snapshot.py  — (re-exports KernelSnapshot from nexus_core)

Shared primitives are defined in nexus_core.wrp and imported here for
backward compatibility:
  - nexus_core.wrp.kernel  → KernelDelta, KernelDeltaBatch, KernelError, KernelResult, KernelSnapshot
  - nexus_core.wrp.states  → WRP_ADJACENCY_MATRIX, RECEIPT_TO_WRP_STATE, is_valid_transition
"""

# Shared primitives from nexus_core
from nexus_core.wrp.kernel import (
    KernelDelta,
    KernelDeltaBatch,
    KernelError,
    KernelResult,
    KernelSnapshot,
)
from nexus_core.wrp.states import (
    WRP_ADJACENCY_MATRIX,
    RECEIPT_TO_WRP_STATE,
    is_valid_transition,
)

# Conduit-specific implementations
from .engine import KernelEngine, KernelState
from .identity import IdentityEngine, Identity
from .graph import GraphIndex, GraphEdge
from .lineage import LineageEngine, LineageEvent

__all__ = [
    "KernelDelta", "KernelDeltaBatch",
    "KernelEngine", "KernelResult", "KernelError",
    "KernelState", "KernelSnapshot",
    "WRP_ADJACENCY_MATRIX", "RECEIPT_TO_WRP_STATE", "is_valid_transition",
    "IdentityEngine", "Identity",
    "GraphIndex", "GraphEdge",
    "LineageEngine", "LineageEvent",
]
