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

    Useful for integrity checking: the live engine and a fresh replay
    should produce identical state.

    Args:
        target_version: Version to compare at.

    Returns:
        dict with 'match': bool, 'live_version', 'replay_version'.
    """
    from app.services.reducer_service import get_engine

    live = get_engine().kernel_state
    reconstructed = replay(target_version)

    live_dict = live.to_dict()
    replay_dict = reconstructed.to_dict()

    # Compare key fields
    match = (
        live.version == reconstructed.version
        and set(live.plans) == set(reconstructed.plans)
        and len(live.receipts) == len(reconstructed.receipts)
    )

    return {
        "match": match,
        "live_version": live.version,
        "replay_version": reconstructed.version,
        "live_plan_count": len(live.plans),
        "replay_plan_count": len(reconstructed.plans),
        "live_receipt_count": len(live.receipts),
        "replay_receipt_count": len(reconstructed.receipts),
    }
