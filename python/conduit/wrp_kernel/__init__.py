"""
WRP Kernel — deterministic, replayable semantic runtime.

A pure-function state machine that processes KernelDelta batches into
KernelState with identity resolution, graph indexing, and lineage tracking.

Architecture:
  delta.py     — KernelDelta input type
  engine.py    — KernelEngine: 5-step reduce (receipts → identity → graph → lineage → commit)
  identity.py  — IdentityEngine: node_id → identity_id resolution
  graph.py     — GraphIndex: identity-based typed edges
  lineage.py   — LineageEngine: causal event recording
  snapshot.py  — KernelSnapshot: versioned state checkpoints

Design reference:
  - kernel-projection-answers.md (2026-06-27)
  - harvest: kernel-vs-projection-design-harvest.md
  - plan: #1023 WRP Kernel Reduce Function (Two-Layer Architecture)
"""

from .delta import KernelDelta, KernelDeltaBatch
from .engine import KernelEngine, KernelResult, KernelError
from .identity import IdentityEngine, Identity
from .graph import GraphIndex, GraphEdge
from .lineage import LineageEngine, LineageEvent
from .snapshot import KernelSnapshot

__all__ = [
    "KernelDelta", "KernelDeltaBatch",
    "KernelEngine", "KernelResult", "KernelError",
    "IdentityEngine", "Identity",
    "GraphIndex", "GraphEdge",
    "LineageEngine", "LineageEvent",
    "KernelSnapshot",
]
