"""
Admin API — GET/PATCH/DELETE /admin

Provides identity management CRUD, cursor-paginated identity listing,
and a consistency check endpoint that verifies engine↔delta-store alignment.

Design: Plan 1055 — Expand FastAPI app/ API Surface
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.reducer_service import (
    current_state,
    current_version,
    get_identity,
)

_log = logging.getLogger("kernel.api.admin")
router = APIRouter()


# ── Response models ──────────────────────────────────────────────────


class IdentitySummary(BaseModel):
    id: str
    label: Optional[str] = None
    aliases: list[str] = []
    node_ids: list[str] = []


class IdentityListResponse(BaseModel):
    identities: list[IdentitySummary]
    total: int
    cursor: Optional[str] = None
    limit: int


class IdentityUpdateRequest(BaseModel):
    label: Optional[str] = None
    aliases: Optional[list[str]] = None


class IdentityUpdateResponse(BaseModel):
    id: str
    label: Optional[str] = None
    aliases: list[str] = []
    updated: bool


class ConsistencyCheck(BaseModel):
    aligned: bool
    engine_version: int
    delta_log_version: int
    engine_plan_count: int
    delta_log_count: int
    details: list[str]


# ── Routes ────────────────────────────────────────────────────────────


@router.get("/identities", response_model=IdentityListResponse)
def list_identities(
    cursor: str = Query("", description="Cursor token from previous page"),
    limit: int = Query(50, description="Max identities per page", ge=1, le=500),
):
    """List all known identities with cursor-based pagination.

    Args:
        cursor: Opaque cursor from the previous response's ``cursor`` field.
                Pass empty string for the first page.
        limit: Items per page (1–500, default 50).

    Returns:
        Paginated identity list with a ``cursor`` for the next page
        (empty string when there are no more results).
    """
    state = current_state()
    identity_map = state.get("identity_map", {})

    # Sort identities by ID for deterministic ordering
    sorted_ids = sorted(identity_map.keys())

    # Apply cursor: skip entries before the cursor
    if cursor:
        try:
            cursor_idx = sorted_ids.index(cursor)
            sorted_ids = sorted_ids[cursor_idx + 1:]
        except ValueError:
            # Cursor not found — start from beginning
            pass

    # Paginate
    page_ids = sorted_ids[:limit]
    next_cursor = page_ids[-1] if len(sorted_ids) > limit else ""

    identities = []
    for iid in page_ids:
        node_ids_map = identity_map[iid]
        node_ids = list(node_ids_map.keys()) if isinstance(node_ids_map, dict) else []
        identities.append(IdentitySummary(
            id=iid,
            label=_infer_label(iid, node_ids),
            aliases=[str(nid) for nid in node_ids],
            node_ids=node_ids,
        ))

    return IdentityListResponse(
        identities=identities,
        total=len(identity_map),
        cursor=next_cursor,
        limit=limit,
    )


@router.patch("/identities/{identity_id}", response_model=IdentityUpdateResponse)
def update_identity(identity_id: str, update: IdentityUpdateRequest):
    """Update identity metadata (label, aliases).

    Args:
        identity_id: Identity ID to update (e.g. ``iden::plan_0053``).
        update: Fields to update (label, aliases).

    Returns:
        Updated identity fields.
    """
    identity = get_identity(identity_id)
    if identity is None:
        raise HTTPException(status_code=404, detail=f"Identity not found: {identity_id}")

    # In-memory update via the engine's identity engine
    from app.services.reducer_service import get_engine
    engine = get_engine()
    state = engine.kernel_state

    id_obj = state.identity.get_identity(identity_id)
    if id_obj is None:
        raise HTTPException(status_code=404, detail=f"Identity not found in engine: {identity_id}")

    updated = False
    if update.label is not None and update.label != id_obj.label:
        id_obj.label = update.label
        updated = True
    if update.aliases is not None:
        # Replace aliases — clear existing then add new
        existing_set = set(id_obj.aliases)
        new_set = set(update.aliases)
        to_remove = existing_set - new_set
        to_add = new_set - existing_set
        for alias in to_remove:
            id_obj.aliases.discard(alias)
        for alias in to_add:
            id_obj.aliases.add(alias)
        updated = updated or bool(to_remove or to_add)

    return IdentityUpdateResponse(
        id=identity_id,
        label=id_obj.label,
        aliases=sorted(id_obj.aliases) if id_obj.aliases else [],
        updated=updated,
    )


@router.delete("/identities/{identity_id}")
def delete_identity(identity_id: str):
    """Remove an identity from the kernel state.

    This detaches the identity and its associated graph edges from the
    in-memory engine state. The delta log and receipt history are preserved.

    Args:
        identity_id: Identity ID to remove (e.g. ``iden::plan_0053``).
    """
    identity = get_identity(identity_id)
    if identity is None:
        raise HTTPException(status_code=404, detail=f"Identity not found: {identity_id}")

    from app.services.reducer_service import get_engine
    engine = get_engine()
    state = engine.kernel_state

    # Remove from identity engine
    state.identity.remove(identity_id)

    # Remove associated graph edges
    state.graph.remove_node(identity_id)

    _log.info("DELETE /admin/identities/%s: identity removed", identity_id)
    return {"ok": True, "identity_id": identity_id}


@router.get("/consistency", response_model=ConsistencyCheck)
def check_consistency():
    """Verify engine↔delta-store alignment.

    Compares the live engine state against the persisted delta log to
    detect drift between in-memory state and the durable event store.

    Returns:
        ``aligned``: True if engine version matches delta store count.
        Detailed counters to aid diagnosis of misalignment.
    """
    from app.storage.delta_store import DeltaStore
    delta_store = DeltaStore()

    engine_ver = current_version()
    state = current_state()
    plan_count = len(state.get("plans", []))

    delta_log_ver = delta_store.count()
    details: list[str] = []

    aligned = True

    if engine_ver != delta_log_ver:
        details.append(
            f"Version mismatch: engine={engine_ver}, delta_log={delta_log_ver}"
        )
        aligned = False
    else:
        details.append(f"Version aligned: engine={engine_ver} == delta_log={delta_log_ver}")

    details.append(f"Plans tracked: {plan_count}")
    details.append(f"Delta log entries: {delta_log_ver}")

    return ConsistencyCheck(
        aligned=aligned,
        engine_version=engine_ver,
        delta_log_version=delta_log_ver,
        engine_plan_count=plan_count,
        delta_log_count=delta_log_ver,
        details=details,
    )


# ── Helpers ────────────────────────────────────────────────────────────


def _infer_label(identity_id: str, node_ids: list[str]) -> str:
    """Infer a human-readable label from an identity ID or its node IDs."""
    if node_ids:
        first = str(node_ids[0])
        if first.startswith("plan_"):
            return f"Plan {first.replace('plan_', '')}"
        return first
    return identity_id
