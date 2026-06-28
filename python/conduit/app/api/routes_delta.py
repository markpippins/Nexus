"""
Delta ingestion API — POST /delta

Receives a KernelDelta JSON payload, validates it,
and processes it through the full reduce pipeline.

Design: kernel-projection-answers.md §8 (routes_delta.py)
"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from wrp_kernel.delta import KernelDelta
from app.services.reducer_service import apply_delta

_log = logging.getLogger("kernel.api.delta")
router = APIRouter()


# ── Request/response models ──────────────────────────────────────────

class DeltaRequest(BaseModel):
    delta_id: str = Field(..., description="Unique delta identifier")
    batch_id: str = Field(..., description="Logical batch grouping")
    receipts: list[dict] = Field(default_factory=list, description="Conduit receipts")
    affected_plans: list[str] = Field(default_factory=list, description="Plan IDs touched")
    invalidated_plans: list[str] = Field(default_factory=list, description="Invalidated plan IDs")


class DeltaResponse(BaseModel):
    success: bool
    version: int
    delta_id: str
    plan_count: int
    receipt_count: int
    error: str | None = None


class StateSummary(BaseModel):
    version: int
    plan_count: int
    receipt_count: int
    identity_count: int
    graph_edge_count: int
    lineage_event_count: int


# ── Routes ────────────────────────────────────────────────────────────

@router.post("/", response_model=DeltaResponse)
def ingest(delta_req: DeltaRequest):
    """Ingest a KernelDelta and process it through the reduce pipeline.

    Returns the new kernel version and a summary of applied state.
    """
    _log.info("POST /delta: delta_id=%s batch=%s receipts=%d",
              delta_req.delta_id, delta_req.batch_id, len(delta_req.receipts))

    # Build domain KernelDelta
    delta = KernelDelta(
        delta_id=delta_req.delta_id,
        batch_id=delta_req.batch_id,
        receipts=delta_req.receipts,
        affected_plans=set(delta_req.affected_plans),
        invalidated_plans=set(delta_req.invalidated_plans),
    )

    # Process
    result = apply_delta(delta)

    if result.is_error:
        _log.warning("POST /delta: FAILED delta_id=%s error=%s",
                     delta_req.delta_id, result.error)
        return DeltaResponse(
            success=False,
            version=0,
            delta_id=delta_req.delta_id,
            plan_count=0,
            receipt_count=0,
            error=result.error.message if result.error else "Unknown error",
        )

    state = result.value
    _log.info("POST /delta: OK delta_id=%s version=%d",
              delta_req.delta_id, state.version)

    return DeltaResponse(
        success=True,
        version=state.version,
        delta_id=delta_req.delta_id,
        plan_count=len(state.plans),
        receipt_count=len(state.receipts),
    )


@router.get("/state", response_model=StateSummary)
def get_delta_state():
    """Return a summary of the current kernel state."""
    from app.services.reducer_service import get_engine
    engine = get_engine()
    state = engine.kernel_state

    return StateSummary(
        version=state.version,
        plan_count=len(state.plans),
        receipt_count=len(state.receipts),
        identity_count=state.identity.known_count(),
        graph_edge_count=state.graph.edge_count(),
        lineage_event_count=state.lineage.event_count(),
    )
