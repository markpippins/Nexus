"""
Kernel data types — shared WRP kernel primitives used by conduit's reduce
engine, replay service, snapshot store, and delta store.

These types have ZERO dependencies on conduit or tackle internals. They are
pure data classes that any component (orchestrator, inference runtime, vision,
analytics) can import from nexus_core.

Types:
    KernelDelta       — One atomic batch of state change (receipts + affected plans).
    KernelDeltaBatch  — Ordered list of KernelDeltas for replay.
    KernelError       — First-class error node in the kernel lineage graph.
    KernelResult      — Result of a KernelEngine.reduce() call (value or error).
    KernelSnapshot    — Versioned checkpoint of KernelState for accelerated reconstruction.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set


# ── Delta ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class KernelDelta:
    """A single atomic batch of state change for the WRP kernel.

    Design invariants:
    - Every KernelDelta is idempotent (applying it twice yields same state).
    - Deltas are ordered by version (monotonic, no gaps).
    - Same batch_id + same receipts = identical delta (replay consistency).

    Fields:
        delta_id: Globally unique identifier for this delta.
        batch_id: Logical batch grouping (may span multiple deltas).
        receipts: List of raw Conduit receipt dicts to process.
        affected_plans: Set of plan IDs touched by this delta.
        invalidated_plans: Set of plan IDs whose cached state is invalidated.
        version: Monotonic version number assigned at commit time.
    """
    delta_id: str
    batch_id: str
    receipts: List[dict] = field(default_factory=list)
    affected_plans: Set[str] = field(default_factory=set)
    invalidated_plans: Set[str] = field(default_factory=set)
    version: int = 0

    def __post_init__(self):
        if not self.delta_id:
            raise ValueError("delta_id is required")
        if self.version < 0:
            raise ValueError(f"version must be >= 0, got {self.version}")


@dataclass(frozen=True)
class KernelDeltaBatch:
    """A sequenced list of KernelDeltas ready for replay.

    Fields:
        batch_id: Logical batch identifier.
        deltas: Ordered list of KernelDelta instances.
        source_hash: Optional provenance hash linking back to harvest.
    """
    batch_id: str
    deltas: List[KernelDelta] = field(default_factory=list)
    source_hash: Optional[str] = None

    def total_receipts(self) -> int:
        return sum(len(d.receipts) for d in self.deltas)


# ── Error model ───────────────────────────────────────────────────────


@dataclass(frozen=True)
class KernelError:
    """A first-class error node in the kernel lineage graph.

    Errors are NOT exceptions — they are recorded semantic events
    that become part of the causal trace.

    Fields:
        type: Error classification:
              - INVARIANT_VIOLATION  — state machine invariant broken
              - IDENTITY_CONFLICT    — identity resolution ambiguity
              - GRAPH_CYCLE          — cycle detected in graph
              - VERSION_MISMATCH     — optimistic concurrency failure
              - INVALID_TRANSITION   — transition not in adjacency matrix
              - VALIDATION_ERROR     — KernelDelta validation failure
        message: Human-readable description.
        affected_nodes: List of entity IDs touched by this error.
        recoverable: Whether the error can be retried.
        step: Which reduce step produced this error.
    """
    type: str = "INVARIANT_VIOLATION"
    message: str = ""
    affected_nodes: List[str] = field(default_factory=list)
    recoverable: bool = False
    step: str = "unknown"


# ── Result ────────────────────────────────────────────────────────────


@dataclass
class KernelResult:
    """The result of a KernelEngine.reduce() call.

    Either value or error is set, never both.
    The lineage_event_id links this result into the causal trace.

    Fields:
        value: New KernelState if reduce succeeded.
        error: KernelError if reduce failed.
        lineage_event_id: ID of the lineage event for this reduce attempt.
    """
    value: Optional[Any] = None   # KernelState (not importable here — no conduit dep)
    error: Optional[KernelError] = None
    lineage_event_id: Optional[str] = None

    @property
    def is_ok(self) -> bool:
        return self.value is not None and self.error is None

    @property
    def is_error(self) -> bool:
        return self.error is not None


# ── Snapshot ──────────────────────────────────────────────────────────


@dataclass
class KernelSnapshot:
    """A versioned checkpoint of KernelState.

    Fields:
        version: KernelState version at the time of this snapshot.
        state: Serialized KernelState dict (plans, receipts, graph, etc.).
        identity_hash: Hash of the identity engine state for integrity checks.
        graph_hash: Hash of the graph index state for integrity checks.
        lineage_cursor: Optional version of the last lineage event included.
        metadata: Optional metadata (timestamp, source, etc.).
    """
    version: int
    state: dict = field(default_factory=dict)
    identity_hash: Optional[str] = None
    graph_hash: Optional[str] = None
    lineage_cursor: Optional[int] = None
    metadata: Optional[dict] = None
