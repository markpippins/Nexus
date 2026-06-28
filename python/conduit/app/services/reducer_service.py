"""
Reducer Service — orchestration layer between the API and the kernel engine.

Design principle (kernel-projection-answers.md section 8):
    1. Persist delta FIRST (source of truth)
    2. Reduce via KernelEngine
    3. Persist lineage
    4. Snapshot occasionally (every N versions)
    5. Return new KernelState

The reducer service is the ONLY component that calls KernelEngine.reduce().
It owns the in-memory engine instance and manages its lifecycle.
"""

import json
import logging
from typing import Optional

from wrp_kernel.delta import KernelDelta
from wrp_kernel.engine import (
    KernelEngine,
    KernelState,
    KernelResult,
    RECEIPT_TO_WRP_STATE,
    WRP_ADJACENCY_MATRIX,
)

from app.storage.delta_store import DeltaStore
from app.storage.snapshot_store import SnapshotStore
from app.storage.lineage_store import LineageStore

_log = logging.getLogger("kernel.reducer_service")

# ── Snapshot frequency ───────────────────────────────────────────────
SNAPSHOT_EVERY = 5  # Persist snapshot every N versions

# ── Stores (singletons) ──────────────────────────────────────────────
delta_store = DeltaStore()
snapshot_store = SnapshotStore()
lineage_store = LineageStore()


# ── Engine lifecycle ─────────────────────────────────────────────────

def _build_engine() -> KernelEngine:
    """Load latest snapshot and construct engine. Falls back to genesis."""
    snapshot = snapshot_store.latest()
    if snapshot is not None:
        state = KernelState.from_dict(snapshot)
        _log.info("ReducerService: loaded snapshot at version=%d", state.version)
    else:
        state = KernelState()
        _log.info("ReducerService: no snapshot found, starting from genesis")
    return KernelEngine(state)


# Global engine instance — survives between requests
ENGINE: Optional[KernelEngine] = None


def get_engine() -> KernelEngine:
    """Get or initialize the global engine instance."""
    global ENGINE
    if ENGINE is None:
        ENGINE = _build_engine()
    return ENGINE


def reset_engine() -> KernelEngine:
    """Force-reload engine from latest snapshot. Used for replay recovery."""
    global ENGINE
    ENGINE = _build_engine()
    return ENGINE


# ── Reduce pipeline ─────────────────────────────────────────────────

def apply_delta(delta: KernelDelta) -> KernelResult:
    """Process a single KernelDelta through the full reduce pipeline.

    Pipeline:
        1. Persist delta to delta log (source of truth)
        2. Reduce via KernelEngine (pure function)
        3. Persist lineage event
        4. Snapshot periodically
        5. Return result

    Args:
        delta: The KernelDelta to process.

    Returns:
        KernelResult with new state or error.
    """
    engine = get_engine()

    # Step 2: Persist delta FIRST (source of truth, before engine interaction)
    # Use version 0 initially — will be updated after reduce completes
    delta_store.save(delta)
    _log.debug("apply_delta: persisted delta_id=%s", delta.delta_id)

    # Step 3: Reduce via kernel engine
    result = engine.reduce(delta)

    # Update delta version in DB to match what the engine assigned
    if result.is_ok:
        updated_delta = KernelDelta(
            delta_id=delta.delta_id,
            batch_id=delta.batch_id,
            receipts=delta.receipts,
            affected_plans=delta.affected_plans,
            invalidated_plans=delta.invalidated_plans,
            version=engine.kernel_state.version,
        )
        delta_store.save(updated_delta)
        _log.debug("apply_delta: updated delta version=%d delta_id=%s",
                   engine.kernel_state.version, delta.delta_id)

    # Step 4: Persist lineage
    lineage_store.record(
        version=engine.kernel_state.version,
        delta_id=delta.delta_id,
        step="reduce",
        event_type="apply" if result.is_ok else "error",
        affected_plans=list(delta.affected_plans),
        detail=(
            f"OK: {len(delta.receipts)} receipts" if result.is_ok
            else f"ERROR: {result.error.message if result.error else 'unknown'}"
        ),
    )

    if result.is_error:
        _log.warning("apply_delta: reduce failed delta_id=%s error=%s",
                     delta.delta_id, result.error)
        return result

    # Step 5: Snapshot periodically
    current_version = engine.kernel_state.version
    if current_version > 0 and current_version % SNAPSHOT_EVERY == 0:
        snapshot_store.save(current_version, engine.kernel_state.to_dict())
        _log.info("apply_delta: snapshot saved at version=%d", current_version)

    return result


# ── Query ────────────────────────────────────────────────────────────

def current_state() -> dict:
    """Return the current KernelState as a serializable dict."""
    engine = get_engine()
    return engine.kernel_state.to_dict()


def current_version() -> int:
    """Return the current kernel version number."""
    engine = get_engine()
    return engine.kernel_state.version


# ── Query helpers ──────────────────────────────────────────────────────


def get_identity(lookup_key: str) -> Optional[dict]:
    """Look up an identity by identity_id, node_id, or bare plan number.

    Tries three forms in order:
      1. identity_id  (e.g. ``iden::plan_0053``)
      2. node_id      (e.g. ``plan_0053``)
      3. bare number  (e.g. ``0053`` → prepends ``plan_``)

    Returns a dict with identity details plus connected graph edges,
    or ``None`` if no match is found.
    """
    engine = get_engine()
    state = engine.kernel_state

    # Try as identity_id first
    identity = state.identity.get_identity(lookup_key)
    if identity is not None:
        return _identity_to_dict(identity, state)

    # Try as node_id
    identity = state.identity.get_identity_for_node(lookup_key)
    if identity is not None:
        return _identity_to_dict(identity, state)

    # Try with plan_ prefix (e.g. "0053" → "plan_0053")
    if not lookup_key.startswith("plan_"):
        identity = state.identity.get_identity_for_node(f"plan_{lookup_key}")
        if identity is not None:
            return _identity_to_dict(identity, state)

    return None


def _identity_to_dict(identity, kernel_state) -> dict:
    """Format an Identity with its graph edges for API responses."""
    return {
        "id": identity.id,
        "aliases": sorted(identity.aliases) if identity.aliases else [],
        "label": identity.label,
        "edges_outgoing": [
            {"target": e.target, "relation": e.relation, "metadata": e.metadata}
            for e in kernel_state.graph.edges_from(identity.id)
        ],
        "edges_incoming": [
            {"source": e.source, "relation": e.relation, "metadata": e.metadata}
            for e in kernel_state.graph.edges_to(identity.id)
        ],
    }


def get_receipt(receipt_id: str) -> Optional[dict]:
    """Look up a single receipt by its receipt ID."""
    engine = get_engine()
    return engine.kernel_state.receipts.get(receipt_id)


def get_receipts_by_plan(plan_num: str) -> list[dict]:
    """Return all receipts whose ``plan_id`` matches the given plan number."""
    engine = get_engine()
    return [
        receipt
        for receipt in engine.kernel_state.receipts.values()
        if receipt.get("plan_id") == plan_num
    ]


def get_plan_detail(plan_num: str) -> Optional[dict]:
    """Return a detailed profile of a single plan.

    Returns the plan's identity, receipt timeline, current WRP state
    (derived from the last receipt type), valid state transitions,
    and connected graph edges.

    Args:
        plan_num: Plan number (e.g. ``"0124"``).

    Returns:
        A dict with the plan's full profile, or ``None`` if the plan
        is not known to the kernel.
    """
    engine = get_engine()
    state = engine.kernel_state

    # 1. Resolve identity
    identity = state.identity.get_identity_for_node(plan_num)
    if identity is None:
        # Try as identity_id (e.g. "iden::0124")
        identity = state.identity.get_identity(f"iden::{plan_num}")
        if identity is None:
            return None

    # 2. Get receipts for this plan, sorted by created_at
    receipts = [
        receipt
        for receipt in state.receipts.values()
        if receipt.get("plan_id") == plan_num
    ]
    receipts.sort(key=lambda r: r.get("created_at", ""))

    # 3. Determine current WRP state from the last receipt type
    current_wrp_state = "UNKNOWN"
    if receipts:
        last_type = receipts[-1].get("type", "")
        current_wrp_state = RECEIPT_TO_WRP_STATE.get(last_type, "UNKNOWN")

    # 4. Valid transitions from current state
    valid_transitions = sorted(WRP_ADJACENCY_MATRIX.get(current_wrp_state, set()))

    # 5. Graph edges for this plan's identity
    edges_outgoing = [
        {"target": e.target, "relation": e.relation, "metadata": e.metadata}
        for e in state.graph.edges_from(identity.id)
    ]
    edges_incoming = [
        {"source": e.source, "relation": e.relation, "metadata": e.metadata}
        for e in state.graph.edges_to(identity.id)
    ]

    return {
        "plan_num": plan_num,
        "identity_id": identity.id,
        "aliases": sorted(identity.aliases) if identity.aliases else [],
        "label": identity.label,
        "receipt_count": len(receipts),
        "current_wrp_state": current_wrp_state,
        "valid_transitions": valid_transitions,
        "receipts": [
            {
                "id": r.get("id"),
                "type": r.get("type"),
                "agent_role": r.get("agent_role"),
                "created_at": r.get("created_at"),
                "summary": r.get("summary", ""),
                "ticket_id": r.get("ticket_id"),
            }
            for r in receipts
        ],
        "edges_outgoing": edges_outgoing,
        "edges_incoming": edges_incoming,
    }


def get_graph() -> dict:
    """Return the full cross-plan graph with expanded identity labels.

    Returns:
        ``{"nodes": [...], "edges": [...]}`` where each edge has
        ``source`` / ``target`` identity IDs plus human-readable labels.
    """
    engine = get_engine()
    state = engine.kernel_state

    # Build node list from all known identities
    nodes = [
        {
            "id": iid,
            "aliases": sorted(identity.aliases) if identity.aliases else [],
            "label": identity.label,
        }
        for iid, identity in state.identity._identities.items()
    ]

    # Build edge list with resolved labels
    edges = [
        {
            "source": edge.source,
            "source_label": (
                state.identity.get_identity(edge.source).label
                if state.identity.get_identity(edge.source)
                else None
            ),
            "target": edge.target,
            "target_label": (
                state.identity.get_identity(edge.target).label
                if state.identity.get_identity(edge.target)
                else None
            ),
            "relation": edge.relation,
            "metadata": edge.metadata,
        }
        for edge in state.graph.all_edges()
    ]

    return {"nodes": nodes, "edges": edges}
