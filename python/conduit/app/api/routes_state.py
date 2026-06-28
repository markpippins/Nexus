"""
State inspection API — GET /state

Returns the full current KernelState as a serializable JSON dict.
Supports summary and full views.

Design: kernel-projection-answers.md §7 (routes_state.py)
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.reducer_service import (
    current_state,
    current_version,
    get_identity,
    get_receipt,
    get_receipts_by_plan,
    get_graph,
)
from app.storage.delta_store import DeltaStore
from app.storage.lineage_store import LineageStore

_log = logging.getLogger("kernel.api.state")
router = APIRouter()

delta_store = DeltaStore()
lineage_store = LineageStore()


# ── Response models ──────────────────────────────────────────────────

class SystemInfo(BaseModel):
    kernel_version: int
    delta_count: int
    plan_count: int
    receipt_count: int
    identity_count: int
    graph_edge_count: int
    lineage_event_count: int


class IdentityResponse(BaseModel):
    id: str
    aliases: list[str]
    label: Optional[str] = None
    edges_outgoing: list[dict] = []
    edges_incoming: list[dict] = []


class ReceiptResponse(BaseModel):
    id: str
    receipt: dict


class GraphResponse(BaseModel):
    nodes: list[dict]
    edges: list[dict]


# ── Routes ────────────────────────────────────────────────────────────

@router.get("/")
def get_state(
    view: str = Query("summary", description="'summary' | 'full'"),
):
    """Return kernel state.

    Args:
        view: 'summary' (default) for counts, 'full' for the entire state dict.

    Returns:
        Summary or full KernelState.
    """
    _log.debug("GET /state: view=%s", view)

    state = current_state()

    if view == "full":
        # Return full serialized state
        return {
            "version": state.get("version", 0),
            "plans": list(state.get("plans", [])),
            "receipt_count": len(state.get("receipts", {})),
            "identity_count": len(state.get("identity_map", {})),
            "graph_edge_count": len(state.get("graph_edges", [])),
            "lineage_event_count": len(state.get("lineage_events", [])),
            "state": state,
        }

    # Summary view
    return {
        "kernel_version": state.get("version", 0),
        "plan_count": len(state.get("plans", [])),
        "receipt_count": len(state.get("receipts", {})),
        "identity_count": len(state.get("identity_map", {})),
        "graph_edge_count": len(state.get("graph_edges", [])),
        "lineage_event_count": len(state.get("lineage_events", [])),
        "delta_log_count": delta_store.count(),
    }


@router.get("/identity/{identity_id}", response_model=IdentityResponse)
def get_identity_route(identity_id: str):
    """Resolve an identity by ID, node_id, or bare plan number.

    Tries three forms in order:
      1. ``iden::plan_0053``  (canonical identity ID)
      2. ``plan_0053``         (node ID)
      3. ``0053``              (bare plan number — prepends ``plan_``)

    Returns identity details plus all connected graph edges.
    """
    _log.debug("GET /state/identity/%s", identity_id)
    result = get_identity(identity_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"Identity not found: {identity_id}",
        )
    return result


@router.get("/receipt/{receipt_id}")
def get_receipt_route(receipt_id: str):
    """Look up a single receipt by its receipt UUID."""
    _log.debug("GET /state/receipt/%s", receipt_id)
    receipt = get_receipt(receipt_id)
    if receipt is None:
        raise HTTPException(
            status_code=404,
            detail=f"Receipt not found: {receipt_id}",
        )
    return {"id": receipt_id, "receipt": receipt}


@router.get("/receipts-by-plan/{plan_num}")
def get_receipts_by_plan_route(plan_num: str):
    """Return all receipts whose ``plan_id`` matches the given plan number.

    Returns an empty list if no receipts match (no error — plan may simply
    have no receipts recorded yet).
    """
    _log.debug("GET /state/receipts-by-plan/%s", plan_num)
    receipts = get_receipts_by_plan(plan_num)
    return {"plan_num": plan_num, "receipts": receipts, "count": len(receipts)}


@router.get("/graph", response_model=GraphResponse)
def get_graph_route():
    """Return the full cross-plan graph with all nodes and typed edges.

    Nodes are all known kernel identities; edges are typed relationships
    (``wrp:depends_on``, ``wrp:impacts_system``, etc.) with resolved
    human-readable labels for each endpoint.
    """
    _log.debug("GET /state/graph")
    return get_graph()


@router.get("/health")
def health():
    """Simple health check — confirms the kernel API is running."""
    return {
        "status": "ok",
        "kernel_version": current_version(),
    }


@router.get("/lineage")
def get_lineage(
    version: int | None = Query(None, description="Optional version filter"),
    limit: int = Query(100, description="Max events"),
):
    """Return lineage events from the database.

    Args:
        version: Optional version filter.
        limit: Max events (default 100).

    Returns:
        List of lineage events.
    """
    events = lineage_store.get_events(version=version, limit=limit)
    return {"events": events, "count": len(events)}
