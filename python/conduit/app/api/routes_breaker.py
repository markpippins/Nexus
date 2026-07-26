"""
Circuit Breaker API — GET/POST /api/breaker

Provides circuit breaker operations currently in conduit-mcp's db.ts
that are NOT yet covered by the Python DBAdapter. The DBAdapter already has:
  trip_circuit_breaker, is_circuit_breaker_tripped, is_conduit_paused,
  set_conduit_paused, get_failure_recovery_config, trip_and_requeue.

Added here:
  GET  /api/breaker           — get full breaker state
  POST /api/breaker/trip      — trip the breaker
  POST /api/breaker/reset     — reset breaker + abandoned tickets
  POST /api/breaker/pause     — pause conduit orchestration
  POST /api/breaker/resume    — resume conduit orchestration
  GET  /api/breaker/failure-recovery — get failure recovery config
  POST /api/breaker/failure-recovery — save failure recovery config

Design: Plan 1055 — conduit-mcp SQL consolidation into Python conduit
"""

import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

_log = logging.getLogger("kernel.api.breaker")
router = APIRouter()


# ── Pydantic models ────────────────────────────────────────────────

class TripRequest(BaseModel):
    reason: Optional[str] = "MANUAL_TRIP"
    detail: Optional[str] = "Manually tripped from UI"
    retryAfter: Optional[int] = 3600


class FailureRecoveryConfig(BaseModel):
    max_retries_per_model: Optional[int] = None
    retry_delay_seconds: Optional[int] = None
    max_fallbacks: Optional[int] = None
    push_back_to_pending: Optional[bool] = None
    circuit_breaker_retry_after: Optional[int] = None


# ── Routes ──────────────────────────────────────────────────────────

@router.get("/")
def get_breaker():
    """Get full circuit breaker state. Equivalent to db.ts getBreaker()."""
    from db_adapter import DBAdapter
    db = DBAdapter()

    with db._get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM circuit_breaker WHERE id = 1"
        ).dict_fetchone()

    if not row:
        return {
            "tripped": False,
            "paused": False,
            "retry_after": 1800,
            "source": "",
            "error": "",
            "detail": "",
            "tripped_at": None,
        }

    return {
        "id": row.get("id"),
        "tripped": bool(row.get("tripped", 0)),
        "paused": bool(row.get("paused", 0)),
        "retry_after": row.get("retry_after", 1800),
        "source": row.get("source", ""),
        "error": row.get("error", ""),
        "detail": row.get("detail", ""),
        "tripped_at": row.get("tripped_at"),
        "max_retries_per_model": row.get("max_retries_per_model", 3),
        "retry_delay_seconds": row.get("retry_delay_seconds", 120),
        "max_fallbacks": row.get("max_fallbacks", 3),
        "push_back_to_pending": bool(row.get("push_back_to_pending", 1)),
    }


@router.post("/trip")
def trip_breaker(body: TripRequest):
    """Trip the circuit breaker. Equivalent to conduit-mcp POST /circuit-breaker/trip."""
    from db_adapter import DBAdapter
    db = DBAdapter()

    from db_adapter import DBAdapter
    db.trip_circuit_breaker(
        error=body.reason or "MANUAL_TRIP",
        detail=body.detail or "Manually tripped from UI",
        source="ui",
        retry_after=body.retryAfter or 3600,
    )

    now = datetime.utcnow().isoformat() + "Z"
    _log.info("Circuit breaker tripped from UI: %s", body.reason or "MANUAL_TRIP")

    return {
        "tripped": True,
        "reason": body.reason or "MANUAL_TRIP",
        "timestamp": now,
    }


@router.post("/reset")
def reset_breaker():
    """Reset the circuit breaker and abandoned tickets.
    Equivalent to conduit-mcp POST /circuit-breaker/reset."""
    from db_adapter import DBAdapter
    db = DBAdapter()

    with db._get_connection() as conn:
        conn.execute(
            "UPDATE circuit_breaker SET tripped = 0, tripped_at = NULL, "
            "error = NULL, detail = NULL, source = NULL, updated_at = %s WHERE id = 1",
            (datetime.utcnow().isoformat() + "Z",),
        )
        conn.commit()

    # Reset abandoned tickets to open
    with db._get_connection() as conn:
        cursor = conn.execute(
            "UPDATE tickets SET status = 'open', session_id = NULL, claimed_at = NULL "
            "WHERE status = 'abandoned'"
        )
        conn.commit()
        tickets_reset = cursor.rowcount or 0

    # Wake the scheduler so it re-polls immediately
    try:
        with db._get_connection() as conn:
            conn.execute(
                "UPDATE circuit_breaker SET wake_requested_at = %s WHERE id = 1",
                (now,),
            )
            conn.commit()
    except Exception:
        pass  # best-effort

    now = datetime.utcnow().isoformat() + "Z"
    _log.info("Circuit breaker reset — %d abandoned ticket(s) reset", tickets_reset)

    return {
        "tripped": False,
        "ticketsReset": tickets_reset,
        "timestamp": now,
    }


@router.post("/pause")
def pause_conduit():
    """Pause conduit orchestration. Equivalent to conduit-mcp POST /conduit/pause."""
    db = DBAdapter()
    db.set_conduit_paused(True)

    now = datetime.utcnow().isoformat() + "Z"
    _log.info("Conduit paused from UI")

    return {"paused": True, "timestamp": now}


@router.post("/resume")
def resume_conduit():
    """Resume conduit orchestration. Equivalent to conduit-mcp POST /conduit/resume."""
    db = DBAdapter()
    db.set_conduit_paused(False)

    now = datetime.utcnow().isoformat() + "Z"
    _log.info("Conduit resumed from UI")

    return {"paused": False, "timestamp": now}


@router.get("/failure-recovery")
def get_failure_recovery():
    """Get failure recovery configuration."""
    from db_adapter import DBAdapter
    db = DBAdapter()

    config = db.get_failure_recovery_config()
    return config


@router.post("/failure-recovery")
def save_failure_recovery(body: FailureRecoveryConfig):
    """Save failure recovery configuration.
    Equivalent to conduit-mcp POST /config/failure-recovery."""
    from db_adapter import DBAdapter
    db = DBAdapter()

    now = datetime.utcnow().isoformat() + "Z"
    with db._get_connection() as conn:
        conn.execute(
            "UPDATE circuit_breaker SET "
            "max_retries_per_model = COALESCE(%s, max_retries_per_model), "
            "retry_delay_seconds = COALESCE(%s, retry_delay_seconds), "
            "max_fallbacks = COALESCE(%s, max_fallbacks), "
            "push_back_to_pending = COALESCE(%s, push_back_to_pending), "
            "retry_after = COALESCE(%s, retry_after), "
            "updated_at = %s "
            "WHERE id = 1",
            (
                body.max_retries_per_model,
                body.retry_delay_seconds,
                body.max_fallbacks,
                1 if body.push_back_to_pending else 0 if body.push_back_to_pending is not None else None,
                body.circuit_breaker_retry_after,
                now,
            ),
        )
        conn.commit()

    _log.info("Failure recovery config updated")
    return {"saved": True}
