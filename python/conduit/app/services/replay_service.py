"""
Replay Service — Kernel Snapshot Reconstruction Algorithm (KSRA).

Reconstructs KernelState at any version by:
    Snapshot(K) + Replay(deltas K+1 → N)

Where K = closest valid snapshot ≤ target_version.

Design: kernel-projection-answers.md §10 (replay_service.py)
"""

import logging
from typing import Optional

from wrp_kernel.engine import KernelEngine, KernelState, reconstruct_kernel_state

from app.storage.delta_store import DeltaStore
from app.storage.snapshot_store import SnapshotStore

_log = logging.getLogger("kernel.replay_service")

delta_store = DeltaStore()
snapshot_store = SnapshotStore()


def replay(target_version: Optional[int] = None) -> KernelState:
    """Reconstruct KernelState via KSRA.

    KernelState(N) = Snapshot(K) + Replay(deltas K+1 → N)

    Args:
        target_version: The version to reconstruct to.
                        If None, reconstructs the latest version.

    Returns:
        Fully reconstructed KernelState.
    """
    # Step 1: Find nearest ancestor snapshot
    if target_version is not None:
        snap_state = snapshot_store.get_nearest(target_version)
    else:
        snap_state = snapshot_store.latest()

    base_version = snap_state.get("version", 0) if snap_state else 0
    _log.info("Replay: base snapshot version=%d target=%s",
              base_version, target_version or "latest")

    # Step 2: Load deltas since snapshot
    deltas = delta_store.load_after(base_version)
    _log.info("Replay: loaded %d deltas since version=%d", len(deltas), base_version)

    # Step 2b: Filter to only deltas ≤ target_version
    if target_version is not None:
        deltas = [d for d in deltas if d.version <= target_version]
        _log.info("Replay: filtered to %d deltas ≤ version=%d",
                  len(deltas), target_version)

    # Step 3: Reconstruct
    state = reconstruct_kernel_state(snapshot_state=snap_state, deltas=deltas)
    _log.info("Replay: reconstructed to version=%d", state.version)

    return state


def compare(target_version: int) -> dict:
    """Compare live engine state vs reconstructed state at a version.

    Deep structural comparison: checks per-identity, per-receipt, and
    per-edge alignment — not just count-level checks.

    Args:
        target_version: Version to compare at.

    Returns:
        dict with 'match': bool, detailed diff fields for identities,
        receipts, and graph edges.
    """
    from app.services.reducer_service import get_engine

    live = get_engine().kernel_state
    reconstructed = replay(target_version)

    # ── Identity comparison ──
    live_ids = set(live.identity._identities.keys()) if hasattr(live.identity, '_identities') else set()
    replay_ids = set(reconstructed.identity._identities.keys()) if hasattr(reconstructed.identity, '_identities') else set()
    missing_ids = replay_ids - live_ids
    extra_ids = live_ids - replay_ids

    # ── Receipt comparison ──
    live_receipt_ids = set(live.receipts.keys()) if hasattr(live, 'receipts') else set()
    replay_receipt_ids = set(reconstructed.receipts.keys()) if hasattr(reconstructed, 'receipts') else set()
    missing_receipts = replay_receipt_ids - live_receipt_ids
    extra_receipts = live_receipt_ids - replay_receipt_ids

    # ── Graph edge comparison ──
    live_edges = set()
    if hasattr(live, 'graph'):
        for e in live.graph.all_edges():
            live_edges.add((e.source, e.target, e.relation or ""))

    replay_edges = set()
    if hasattr(reconstructed, 'graph'):
        for e in reconstructed.graph.all_edges():
            replay_edges.add((e.source, e.target, e.relation or ""))

    missing_edges = replay_edges - live_edges
    extra_edges = live_edges - replay_edges

    # ── Version / plan alignment ──
    version_match = live.version == reconstructed.version
    plans_match = set(live.plans) == set(reconstructed.plans)

    match = (
        version_match
        and plans_match
        and not missing_ids
        and not extra_ids
        and not missing_receipts
        and not extra_receipts
        and not missing_edges
        and not extra_edges
    )

    diffs = []
    if not version_match:
        diffs.append(f"Version: live={live.version} replay={reconstructed.version}")
    if not plans_match:
        diffs.append("Plan set mismatch")
    if missing_ids:
        diffs.append(f"Missing identities (in replay but not live): {sorted(missing_ids)[:10]}")
    if extra_ids:
        diffs.append(f"Extra identities (in live but not replay): {sorted(extra_ids)[:10]}")
    if missing_receipts:
        diffs.append(f"Missing receipts (in replay but not live): {sorted(missing_receipts)[:10]}")
    if extra_receipts:
        diffs.append(f"Extra receipts (in live but not replay): {sorted(extra_receipts)[:10]}")
    if missing_edges:
        diffs.append(f"Missing edges (in replay but not live): {sorted(missing_edges)[:10]}")
    if extra_edges:
        diffs.append(f"Extra edges (in live but not replay): {sorted(extra_edges)[:10]}")

    return {
        "match": match,
        "live_version": live.version,
        "replay_version": reconstructed.version,
        "live_plan_count": len(live.plans),
        "replay_plan_count": len(reconstructed.plans),
        "live_receipt_count": len(live.receipts) if hasattr(live, 'receipts') else 0,
        "replay_receipt_count": len(reconstructed.receipts) if hasattr(reconstructed, 'receipts') else 0,
        "live_identity_count": len(live_ids),
        "replay_identity_count": len(replay_ids),
        "live_edge_count": len(live_edges),
        "replay_edge_count": len(replay_edges),
        "diffs": diffs,
    }
