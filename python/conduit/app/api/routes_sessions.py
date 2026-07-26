"""
Sessions API — GET/POST/PATCH /api/sessions

Provides the session lifecycle operations currently in conduit-mcp's db.ts
that are NOT yet covered by the Python DBAdapter. The DBAdapter already has:
  create_session, close_session, update_session_activity, get_active_session,
  get_all_active_sessions, add_session_work_time.

Added here:
  GET  /api/sessions           — list all sessions (not just active)
  GET  /api/sessions/:id       — get single session by ID
  PATCH /api/sessions/:id/cost — update session cost
  POST /api/sessions/:id/heartbeat — update heartbeat+activity
  POST /api/sessions/:id/kill  — kill session (end + release tickets)
  GET  /api/sessions/running   — get running sessions only
  GET  /api/sessions/stale     — detect stale sessions

Design: Plan 1055 — conduit-mcp SQL consolidation into Python conduit
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

_log = logging.getLogger("kernel.api.sessions")
router = APIRouter()


# ── Pydantic models ────────────────────────────────────────────────

class SessionKillResult(BaseModel):
    killed: bool
    sessionId: str
    pids: list[int] = []
    errors: list[str] = []
    timestamp: str


class SessionCostUpdate(BaseModel):
    cost_usd: float


class SessionHeartbeatRequest(BaseModel):
    role: Optional[str] = None
    state: Optional[str] = None
    detail: Optional[str] = None
    pid: Optional[int] = None


# ── Routes ──────────────────────────────────────────────────────────

@router.get("/")
def list_all_sessions(
    running_only: bool = Query(False, description="Only return running sessions"),
):
    """List all sessions. Equivalent to db.ts getAllSessions()."""
    from db_adapter import DBAdapter
    db = DBAdapter()

    if running_only:
        sessions = db.get_all_active_sessions()
        return {"sessions": sessions, "count": len(sessions)}

    # Full list: active + look up completed via direct SQL
    with db._get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM sessions ORDER BY created_at DESC LIMIT 500"
        )
        rows = cursor.dict_fetchall()
        return {"sessions": rows, "count": len(rows)}


@router.get("/running")
def get_running_sessions():
    """Get currently running sessions. Equivalent to db.ts getRunningSessions()."""
    from db_adapter import DBAdapter
    db = DBAdapter()
    sessions = db.get_all_active_sessions()
    return {"sessions": sessions, "count": len(sessions)}


@router.get("/stale")
def get_stale_sessions(
    threshold_seconds: int = Query(3600, description="Staleness threshold in seconds"),
):
    """Detect stale sessions (no heartbeat within threshold)."""
    from db_adapter import DBAdapter
    db = DBAdapter()
    threshold = (datetime.utcnow() - timedelta(seconds=threshold_seconds)).isoformat() + "Z"
    with db._get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM sessions WHERE is_running = 1 "
            "AND last_activity IS NOT NULL AND last_activity < %s",
            (threshold,),
        )
        rows = cursor.dict_fetchall()
        return {"sessions": rows, "count": len(rows), "threshold_seconds": threshold_seconds}


@router.get("/{session_id}")
def get_session(session_id: str):
    """Get a single session by ID. Equivalent to db.ts getSession()."""
    from db_adapter import DBAdapter
    db = DBAdapter()

    # Check active first
    with db._get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM sessions WHERE id = %s", (session_id,)
        )
        row = cursor.dict_fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
        return row


@router.patch("/{session_id}/cost")
def update_session_cost(session_id: str, body: SessionCostUpdate):
    """Update session token cost. Equivalent to db.ts updateSessionCost()."""
    from db_adapter import DBAdapter
    db = DBAdapter()

    if not isinstance(body.cost_usd, (int, float)) or body.cost_usd < 0:
        raise HTTPException(status_code=400, detail="Invalid cost_usd")

    with db._get_connection() as conn:
        conn.execute(
            "UPDATE sessions SET cost_usd = COALESCE(cost_usd, 0) + %s WHERE id = %s",
            (body.cost_usd, session_id),
        )
        conn.commit()

    return {"updated": True, "sessionId": session_id, "cost_usd": body.cost_usd}


@router.post("/{session_id}/heartbeat")
def update_session_heartbeat(session_id: str, body: Optional[SessionHeartbeatRequest] = None):
    """Update session heartbeat timestamp. Equivalent to db.ts updateSessionHeartbeat()."""
    from db_adapter import DBAdapter
    db = DBAdapter()

    now = datetime.utcnow().isoformat() + "Z"
    with db._get_connection() as conn:
        conn.execute(
            "UPDATE sessions SET last_activity = %s, last_heartbeat_at = %s WHERE id = %s",
            (now, now, session_id),
        )
        conn.commit()

    return {"updated": True, "sessionId": session_id, "timestamp": now}


@router.post("/{session_id}/kill")
def kill_session(session_id: str):
    """Kill a running session. Equivalent to conduit-mcp POST /sessions/:id/kill."""
    import os
    import signal
    from db_adapter import DBAdapter
    db = DBAdapter()

    # Validate session ID using the same regex as conduit-mcp
    import re
    if not re.match(r'^[a-zA-Z0-9_-]+$', session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    # Get the session
    with db._get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM sessions WHERE id = %s", (session_id,)
        ).dict_fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    if not row.get("is_running"):
        raise HTTPException(
            status_code=400,
            detail=f"Session is not running",
        )

    now = datetime.utcnow().isoformat() + "Z"
    killed_pids: list[int] = []
    errors: list[str] = []

    # Kill the process
    pid = row.get("pid")
    if pid and pid > 0:
        try:
            os.killpg(pid, signal.SIGKILL)
            killed_pids.append(pid)
        except (ProcessLookupError, OSError) as e:
            try:
                os.kill(pid, signal.SIGKILL)
                killed_pids.append(pid)
            except OSError as e2:
                errors.append(f"PID {pid}: {e2}")

    # Close the session
    db.close_session(session_id, 137)

    # Release tickets claimed by this session
    released = db.release_session_tickets(session_id)
    if released > 0:
        _log.info("Released %d tickets from killed session %s", released, session_id)

    return {
        "killed": True,
        "sessionId": session_id,
        "pids": killed_pids,
        "errors": errors if errors else None,
        "timestamp": now,
    }
