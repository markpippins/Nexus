"""
Replay API — GET /replay

Reconstructs KernelState at any version via KSRA:
    Snapshot(K) + Replay(deltas K+1 → N)

Also provides comparison endpoint to verify live engine integrity.

Design: kernel-projection-answers.md §10 (routes_replay.py)
"""

import logging
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.replay_service import replay, compare

_log = logging.getLogger("kernel.api.replay")
router = APIRouter()


# ── Response models ──────────────────────────────────────────────────

class ReplayResponse(BaseModel):
    version: int
    plan_count: int
    receipt_count: int
    identity_count: int
    graph_edge_count: int
    lineage_event_count: int
    reconstructed_from_version: int


class CompareResponse(BaseModel):
    match: bool
    live_version: int
    replay_version: int
    live_plan_count: int
    replay_plan_count: int
    live_receipt_count: int
    replay_receipt_count: int


# ── Routes ────────────────────────────────────────────────────────────

@router.get("/", response_model=ReplayResponse)
def get_replay(
    version: int | None = Query(None, description="Target version. None = latest"),
):
    """Reconstruct KernelState via KSRA at the given version.

    Args:
        version: Target version. If omitted, reconstructs the latest.

    Returns:
        Summary of reconstructed state.
    """
    _log.info("GET /replay: target_version=%s", version or "latest")

    state = replay(target_version=version)

    return ReplayResponse(
        version=state.version,
        plan_count=len(state.plans),
        receipt_count=len(state.receipts),
        identity_count=state.identity.known_count(),
        graph_edge_count=state.graph.edge_count(),
        lineage_event_count=state.lineage.event_count(),
        reconstructed_from_version=state.version,
    )


@router.get("/compare", response_model=CompareResponse)
def compare_replay(
    version: int = Query(..., description="Version to compare at"),
):
    """Compare live engine state vs reconstructed state at a version.

    If match=False, the live engine has diverged from what a clean
    replay would produce — possible snapshot corruption.
    """
    _log.info("GET /replay/compare: target_version=%d", version)

    result = compare(version)

    return CompareResponse(
        match=result["match"],
        live_version=result["live_version"],
        replay_version=result["replay_version"],
        live_plan_count=result["live_plan_count"],
        replay_plan_count=result["replay_plan_count"],
        live_receipt_count=result["live_receipt_count"],
        replay_receipt_count=result["replay_receipt_count"],
    )
