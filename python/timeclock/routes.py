"""
API routes for the agent timeclock service.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update, func
from sqlalchemy.orm import Session

from db import get_db
from models import AgentTimeclock

_log = logging.getLogger("timeclock.api")

router = APIRouter()


# ── Request/Response Models ──────────────────────────────────────

class ClockInRequest(BaseModel):
    role: str = Field(..., description="Agent role (e.g., architect, builder)")
    model: str = Field(..., description="Model being used (e.g., big-pickle)")
    session_id: Optional[str] = Field(None, description="Optional CLI session ID")
    metadata: Optional[dict] = Field(None, description="Optional extra context")


class ClockOutRequest(BaseModel):
    role: str = Field(..., description="Agent role")
    session_id: Optional[str] = Field(None, description="Session ID to clock out")


class HeartbeatRequest(BaseModel):
    role: str = Field(..., description="Agent role")
    session_id: Optional[str] = Field(None, description="Session ID to update")


class TimeclockResponse(BaseModel):
    success: bool
    record: Optional[dict] = None
    message: Optional[str] = None


class ActiveSessionsResponse(BaseModel):
    count: int
    sessions: list[dict]


class SessionLogResponse(BaseModel):
    count: int
    sessions: list[dict]


# ── Routes ───────────────────────────────────────────────────────

@router.post("/clock-in", response_model=TimeclockResponse)
def clock_in(req: ClockInRequest, db: Session = Depends(get_db)):
    """Clock in an agent session."""
    record = AgentTimeclock(
        role=req.role,
        model=req.model,
        session_id=req.session_id,
        status="active",
        metadata_=req.metadata,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    _log.info("Clocked in: role=%s model=%s session=%s", req.role, req.model, req.session_id)
    return TimeclockResponse(success=True, record=record.to_dict(), message="Clocked in")


@router.post("/clock-out", response_model=TimeclockResponse)
def clock_out(req: ClockOutRequest, db: Session = Depends(get_db)):
    """Clock out an agent session."""
    query = select(AgentTimeclock).where(
        AgentTimeclock.role == req.role,
        AgentTimeclock.status == "active",
    )
    if req.session_id:
        query = query.where(AgentTimeclock.session_id == req.session_id)

    record = db.execute(query).scalar_one_or_none()

    if not record:
        raise HTTPException(status_code=404, detail=f"No active session found for role={req.role}")

    record.clock_out = datetime.now(timezone.utc)
    record.status = "closed"
    record.recorded_until_dt = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)

    _log.info("Clocked out: role=%s session=%s duration=%.1fs",
              req.role, req.session_id, record.to_dict()["duration_seconds"])
    return TimeclockResponse(success=True, record=record.to_dict(), message="Clocked out")


@router.post("/heartbeat", response_model=TimeclockResponse)
def heartbeat(req: HeartbeatRequest, db: Session = Depends(get_db)):
    """Update heartbeat for an active session."""
    query = select(AgentTimeclock).where(
        AgentTimeclock.role == req.role,
        AgentTimeclock.status == "active",
    )
    if req.session_id:
        query = query.where(AgentTimeclock.session_id == req.session_id)

    record = db.execute(query).scalar_one_or_none()

    if not record:
        raise HTTPException(status_code=404, detail=f"No active session found for role={req.role}")

    # Touch valid_until to extend the session
    record.valid_until = datetime.now(timezone.utc)
    record.recorded_on_dt = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)

    return TimeclockResponse(success=True, record=record.to_dict(), message="Heartbeat received")


@router.get("/active", response_model=ActiveSessionsResponse)
def active_sessions(
    role: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get all active (clocked in) sessions."""
    query = select(AgentTimeclock).where(AgentTimeclock.status == "active")
    if role:
        query = query.where(AgentTimeclock.role == role)

    records = db.execute(query.order_by(AgentTimeclock.clock_in.desc())).scalars().all()
    return ActiveSessionsResponse(
        count=len(records),
        sessions=[r.to_dict() for r in records],
    )


@router.get("/log", response_model=SessionLogResponse)
def session_log(
    role: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Get session history."""
    query = select(AgentTimeclock)
    if role:
        query = query.where(AgentTimeclock.role == role)

    records = db.execute(
        query.order_by(AgentTimeclock.clock_in.desc()).limit(limit)
    ).scalars().all()

    return SessionLogResponse(
        count=len(records),
        sessions=[r.to_dict() for r in records],
    )


@router.get("/stats")
def session_stats(db: Session = Depends(get_db)):
    """Get aggregate statistics."""
    # Total sessions
    total = db.execute(select(func.count(AgentTimeclock.id))).scalar() or 0

    # Active sessions
    active = db.execute(
        select(func.count(AgentTimeclock.id)).where(AgentTimeclock.status == "active")
    ).scalar() or 0

    # Total time by role
    time_by_role = db.execute(
        select(
            AgentTimeclock.role,
            func.sum(
                func.extract("epoch", AgentTimeclock.clock_out - AgentTimeclock.clock_in)
            ).label("total_seconds"),
        )
        .where(AgentTimeclock.clock_out.isnot(None))
        .group_by(AgentTimeclock.role)
    ).all()

    # Sessions by model
    sessions_by_model = db.execute(
        select(
            AgentTimeclock.model,
            func.count(AgentTimeclock.id).label("count"),
        )
        .group_by(AgentTimeclock.model)
    ).all()

    return {
        "total_sessions": total,
        "active_sessions": active,
        "time_by_role": {r.role: round(r.total_seconds or 0, 1) for r in time_by_role},
        "sessions_by_model": {r.model: r.count for r in sessions_by_model},
    }


@router.post("/timeout-cleanup")
def timeout_cleanup(
    timeout_minutes: int = 60,
    db: Session = Depends(get_db),
):
    """Mark sessions as timed out if they've been active longer than timeout_minutes."""
    now = datetime.now(timezone.utc)
    # Calculate cutoff time
    from datetime import timedelta
    cutoff = now - timedelta(minutes=timeout_minutes)

    result = db.execute(
        update(AgentTimeclock)
        .where(
            AgentTimeclock.status == "active",
            AgentTimeclock.clock_in < cutoff,
        )
        .values(
            status="timeout",
            clock_out=now,
            recorded_until_dt=now,
        )
    )

    db.commit()

    _log.info("Timeout cleanup: marked %d sessions as timed out", result.rowcount)
    return {"success": True, "timed_out": result.rowcount}
