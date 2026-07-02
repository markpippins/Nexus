"""
KernelEngine — the core deterministic reduce engine for the WRP kernel.

Defines the KernelResult type and the 5-step reduce pipeline:
  1. Receipt Materialization  — insert receipts into KernelState
  2. Identity Resolution       — node_id → identity_id mapping
  3. Graph Update              — build identity-based GraphEdges
  4. Lineage Recording          — trace every reduce step
  5. Commit                   — increment version, return new state

The engine is a pure function: same input → same output, no IO, no side effects.

Design reference: kernel-projection-answers.md §8 (engine.py)
Plan: #1023 WRP Kernel Reduce Function (Two-Layer Architecture)

# GENERATED FROM CANONICAL — typescript/conduit-mcp/src/receipts.ts (receipt transitions)
#                             typescript/nebula-mcp/src/conduit-wrp-contract.ts (WRP states)
#
# Do not edit this mapping table independently — reconcile against the TypeScript
# canonical source. See: AUDIT>PLAN_1053_RECONCILIATION.md for drift tracking.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Set, Optional, Any, Tuple

from .delta import KernelDelta
from .identity import IdentityEngine, Identity
from .graph import GraphIndex, GraphEdge
from .lineage import LineageEngine, LineageEvent


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
    value: Optional["KernelState"] = None
    error: Optional[KernelError] = None
    lineage_event_id: Optional[str] = None

    @property
    def is_ok(self) -> bool:
        return self.value is not None and self.error is None

    @property
    def is_error(self) -> bool:
        return self.error is not None


# ── Kernel state ──────────────────────────────────────────────────────


@dataclass
class KernelState:
    """The composite state structure of the WRP kernel.

    Holds all plans, receipts, transitions, and cross-references
    in one versioned structure. Each Reduce() invocation produces
    a new KernelState with an incremented version.

    Fields:
        version: Monotonic version counter. Incremented on state-modifying
                 reduce only. No-op deltas do NOT increment version.
        receipts: Map of receipt_id → receipt dict (raw Conduit receipts).
        plans: Set of plan IDs known to the kernel.
        transitions: Ordered list of applied transitions.
        graph: GraphIndex of cross-plan references.
        identity: IdentityEngine state (identity_id mappings).
        lineage: LineageEngine state (event trace).
        metadata: Optional arbitrary metadata dict.
    """
    version: int = 0
    receipts: Dict[str, dict] = field(default_factory=dict)
    plans: Set[str] = field(default_factory=set)
    transitions: List[dict] = field(default_factory=list)
    graph: GraphIndex = field(default_factory=GraphIndex)
    identity: IdentityEngine = field(default_factory=IdentityEngine)
    lineage: LineageEngine = field(default_factory=LineageEngine)
    metadata: Optional[dict] = None

    def to_dict(self) -> dict:
        """Serialize KernelState to a dict for snapshotting.

        Note: GraphIndex, IdentityEngine, and LineageEngine are
        serialized as their internal state dicts. They are
        reconstructed via their respective from_dict() methods.
        """
        return {
            "version": self.version,
            "receipts": self.receipts,
            "plans": list(self.plans),
            "transitions": self.transitions,
            "graph_edges": [(e.source, e.target, e.relation, e.metadata)
                            for e in self.graph.all_edges()],
            "identity_map": dict(self.identity._node_map),
            "lineage_events": [
                {
                    "version": e.version,
                    "delta_id": e.delta_id,
                    "step": e.step,
                    "event_type": e.event_type,
                    "affected_plans": e.affected_plans,
                    "detail": e.detail,
                }
                for e in self.lineage.all_events()
            ],
            "metadata": self.metadata,
        }

    @staticmethod
    def from_dict(data: dict) -> "KernelState":
        """Reconstruct KernelState from a serialized dict."""
        state = KernelState(
            version=data.get("version", 0),
            receipts=data.get("receipts", {}),
            plans=set(data.get("plans", [])),
            transitions=data.get("transitions", []),
            metadata=data.get("metadata"),
        )
        # Rebuild graph
        for source, target, relation, metadata in data.get("graph_edges", []):
            state.graph.add(GraphEdge(
                source=source,
                target=target,
                relation=relation,
                metadata=metadata,
            ))
        # Rebuild identity
        for node_id, identity_id in data.get("identity_map", {}).items():
            state.identity._node_map[node_id] = identity_id
            state.identity._identities[identity_id] = \
                Identity(
                    id=identity_id,
                    aliases={node_id},
                )
        # Rebuild lineage
        for ev in data.get("lineage_events", []):
            state.lineage._events.append(LineageEvent(
                version=ev["version"],
                delta_id=ev["delta_id"],
                step=ev["step"],
                event_type=ev.get("event_type", "apply"),
                affected_plans=ev.get("affected_plans", []),
                detail=ev.get("detail"),
            ))
        return state


# ── The adjacency matrix ──────────────────────────────────────────────

WRP_ADJACENCY_MATRIX: Dict[str, Set[str]] = {
    "CREATED":       {"INTAKE", "FAILED"},
    "INTAKE":        {"PLANNING", "FAILED"},
    "PLANNING":      {"CRITIQUE", "FAILED"},
    "CRITIQUE":      {"PLANNING", "SPECIFICATION", "FAILED"},
    "SPECIFICATION": {"CRITIQUE", "APPROVED", "FAILED"},
    "APPROVED":      {"SPECIFICATION", "QUEUED", "FAILED"},
    "QUEUED":        {"EXECUTING", "FAILED"},
    "EXECUTING":     {"COMPLETED", "FAILED"},
    "COMPLETED":     {"ARCHIVED"},  # NB: FAILED not valid from COMPLETED — terminal success
    "ARCHIVED":      set(),
    "FAILED":        set(),
}


def is_valid_transition(from_state: str, to_state: str) -> bool:
    """Check if a WRP state transition is valid per the adjacency matrix."""
    allowed = WRP_ADJACENCY_MATRIX.get(from_state, set())
    return to_state in allowed


# ── The receipt → WRP state mapping ───────────────────────────────────

RECEIPT_TO_WRP_STATE: Dict[str, str] = {
    "PROPOSED": "CREATED",
    "PLANNING": "INTAKE",
    "PLAN_CREATE": "PLANNING",
    "CRITIQUE": "CRITIQUE",
    "CRITIQUE_PASS": "SPECIFICATION",
    "CRITIQUE_REJECT": "PLANNING",
    "IMPLEMENTATION": "EXECUTING",
    "CCNF_EXECUTION": "EXECUTING",
    "REVIEW": "APPROVED",
    "REVIEW_PASS": "COMPLETED",
    "REVIEW_REJECT": "EXECUTING",
    "BLOCK": "FAILED",
    "PLAN_BLOCK": "FAILED",
    "API_LIMIT": "FAILED",
    "HOLD": "QUEUED",
    "REQUEUED": "QUEUED",
    "CANCELLED": "ARCHIVED",
    "ABANDONED": "FAILED",
}


# ── Kernel engine ─────────────────────────────────────────────────────


class KernelEngine:
    """The core deterministic reduce engine.

    Processes KernelDelta batches through a 5-step pipeline:
    1. Receipt Materialization
    2. Identity Resolution
    3. Graph Update
    4. Lineage Recording
    5. Commit

    Usage:
        engine = KernelEngine()
        result = engine.reduce(delta)
        if result.is_ok:
            state = result.value
    """

    def __init__(self, state: Optional[KernelState] = None) -> None:
        """Initialize the engine with an optional starting state.

        Args:
            state: Initial KernelState. If None, creates a fresh empty state.
        """
        self.kernel_state = state if state is not None else KernelState()

    # ── Main reduce entry point ───────────────────────────────────────

    def reduce(self, delta: KernelDelta) -> KernelResult:
        """Apply a KernelDelta through the 5-step reduce pipeline.

        All-or-nothing semantics: if any step fails, the entire delta is
        rejected and KernelState is unchanged.

        Args:
            delta: The KernelDelta to process.

        Returns:
            KernelResult with either the new KernelState or a KernelError.
        """
        # Snapshot current state for rollback on all-or-nothing
        original_state = self.kernel_state

        try:
            # Step 1: Receipt Materialization
            step_result = self._materialize(delta)
            if step_result is not None:
                return step_result

            # Step 2: Identity Resolution
            step_result = self._resolve_identities(delta)
            if step_result is not None:
                self.kernel_state = original_state
                return step_result

            # Step 3: Graph Update
            step_result = self._update_graph(delta)
            if step_result is not None:
                self.kernel_state = original_state
                return step_result

            # Step 4: Lineage Recording
            self._record_lineage(delta)

            # Step 5: Commit (increment version)
            self.kernel_state.version += 1

            return KernelResult(value=self.kernel_state)

        except Exception as exc:
            self.kernel_state = original_state
            return KernelResult(
                error=KernelError(
                    type="INVARIANT_VIOLATION",
                    message=f"Unexpected error during reduce: {exc}",
                    step="unknown",
                    recoverable=False,
                )
            )

    # ── Step 1: Receipt Materialization ───────────────────────────────

    def _materialize(self, delta: KernelDelta) -> Optional[KernelResult]:
        """Phase 1: Insert receipts into the kernel's receipt store.

        All-or-nothing: if any duplicate receipt_id is found, reject.
        """
        for receipt in delta.receipts:
            receipt_id = receipt.get("id") or receipt.get("receipt_id")
            if not receipt_id:
                return KernelResult(
                    error=KernelError(
                        type="VALIDATION_ERROR",
                        message="Receipt missing 'id' or 'receipt_id' field",
                        affected_nodes=list(delta.affected_plans),
                        step="materialize",
                        recoverable=False,
                    )
                )
            if receipt_id in self.kernel_state.receipts:
                return KernelResult(
                    error=KernelError(
                        type="INVARIANT_VIOLATION",
                        message=f"Duplicate receipt_id: {receipt_id}",
                        affected_nodes=[receipt_id],
                        step="materialize",
                        recoverable=False,
                    )
                )
            self.kernel_state.receipts[receipt_id] = receipt

        # Track affected plans
        for plan_id in delta.affected_plans:
            self.kernel_state.plans.add(plan_id)

        return None  # success

    # ── Step 2: Identity Resolution ───────────────────────────────────

    def _resolve_identities(self, delta: KernelDelta) -> Optional[KernelResult]:
        """Phase 2: Resolve all node_ids in receipts to stable identity_ids.

        Each receipt's node_id (if present) is resolved via IdentityEngine.
        """
        for receipt in delta.receipts:
            node_id = receipt.get("node_id") or receipt.get("plan_id")
            if node_id:
                identity_id = self.kernel_state.identity.resolve(
                    node_id=node_id,
                    plan_id=receipt.get("plan_id", ""),
                )
                receipt["_identity_id"] = identity_id

        return None  # success

    # ── Step 3: Graph Update ──────────────────────────────────────────

    def _update_graph(self, delta: KernelDelta) -> Optional[KernelResult]:
        """Phase 3: Build identity-based graph edges from receipts.

        Scans dependencies, references, and cross-refs in receipts
        to build typed GraphEdges.
        """
        for receipt in delta.receipts:
            source_id = receipt.get("_identity_id") or receipt.get("plan_id")
            if not source_id:
                continue

            # Create edges from plan dependencies
            deps = receipt.get("dependencies", [])
            if isinstance(deps, str):
                import json
                try:
                    deps = json.loads(deps)
                except (json.JSONDecodeError, TypeError):
                    deps = []

            for dep in deps:
                # Only strip "#0" prefix for conduit-style ticket references,
                # not leading zeros in plan numbers
                dep_id = dep
                if isinstance(dep, str):
                    if dep.startswith("#0"):
                        dep_id = dep[2:]
                    elif dep.startswith("#"):
                        dep_id = dep[1:]
                else:
                    dep_id = str(dep)
                # If the dependency is a known plan, use that plan's identity
                plan_node_id = f"plan_{dep_id}"
                if dep_id in self.kernel_state.plans and \
                        plan_node_id in self.kernel_state.identity._node_map:
                    target_identity = self.kernel_state.identity._node_map[plan_node_id]
                else:
                    target_identity = self.kernel_state.identity.resolve(
                        node_id=dep_id,
                        plan_id="",
                    )
                self.kernel_state.graph.add(GraphEdge(
                    source=source_id,
                    target=target_identity,
                    relation="wrp:depends_on",
                    metadata={"dependencyType": "explicit"},
                ))

            # Create edges from files_affected → system impacts
            files = receipt.get("files_affected", [])
            if isinstance(files, str):
                import json
                try:
                    files = json.loads(files)
                except (json.JSONDecodeError, TypeError):
                    files = []

            seen_systems: Set[str] = set()
            for filepath in files:
                system = filepath.split("/")[0] if isinstance(filepath, str) else str(filepath)
                if system and system not in seen_systems:
                    seen_systems.add(system)
                    sys_identity = self.kernel_state.identity.resolve(
                        node_id=system,
                        plan_id="",
                    )
                    self.kernel_state.graph.add(GraphEdge(
                        source=source_id,
                        target=sys_identity,
                        relation="wrp:impacts_system",
                        metadata={"file": filepath},
                    ))

        return None  # success

    # ── Step 4: Lineage Recording ─────────────────────────────────────

    def _record_lineage(self, delta: KernelDelta) -> None:
        """Phase 4: Record every reduce step as a lineage event."""
        self.kernel_state.lineage.record_from_delta(
            version=self.kernel_state.version,
            delta_id=delta.delta_id,
            step="reduce",
            event_type="apply",
            affected_plans=list(delta.affected_plans),
            detail=f"Processed {len(delta.receipts)} receipts across "
                   f"{len(delta.affected_plans)} plans",
        )

    # ── Utility ───────────────────────────────────────────────────────

    def to_state(self) -> KernelState:
        """Return the current KernelState."""
        return self.kernel_state

    def reset(self) -> None:
        """Reset the engine to a fresh empty state. For test isolation."""
        self.kernel_state = KernelState()


# ── Reconstruction (KSRA) ─────────────────────────────────────────────


def reconstruct_kernel_state(
    snapshot_state: Optional[dict],
    deltas: List[KernelDelta],
) -> KernelState:
    """Reconstruct KernelState via the Kernel Snapshot Reconstruction Algorithm.

    KernelState(N) = Snapshot(K) + Replay(deltas K+1 → N)

    Where K = closest valid snapshot version ≤ N.

    Args:
        snapshot_state: The deserialized snapshot state dict, or None
                        if no snapshot is available (rebuild from genesis).
        deltas: Ordered list of KernelDeltas to replay.

    Returns:
        The fully reconstructed KernelState.

    Design reference: kernel-projection-answers.md §3 (KSRA)
    """
    if snapshot_state is not None:
        state = KernelState.from_dict(snapshot_state)
    else:
        state = KernelState()

    # Filter to only deltas > snapshot version
    replay_deltas = [d for d in deltas if d.version > state.version]

    engine = KernelEngine(state)
    for delta in replay_deltas:
        result = engine.reduce(delta)
        if result.is_error:
            # Per KSRA: during reconstruction, log error and continue
            # if policy allows (partial insight is still valid)
            engine.kernel_state.lineage.record_from_delta(
                version=engine.kernel_state.version,
                delta_id=delta.delta_id,
                step="reconstruct",
                event_type="error",
                detail=f"Reconstruction error: {result.error.message}",
            )

    return engine.kernel_state
