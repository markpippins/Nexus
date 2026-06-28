"""
Lineage persistence — SQLAlchemy ORM + Store for lineage event rows.

Design principle (kernel-projection-answers.md section 4.3):
    Lineage is an append-only audit trail of every reduce step.
    It provides the causal graph backing for replay verification.
"""

import json
import logging
from typing import Optional, List

from sqlalchemy import Column, String, Integer, Text

from app.models.db import Base, SessionLocal

_log = logging.getLogger("kernel.lineage_store")


# ── ORM row model ────────────────────────────────────────────────────

class LineageRow(Base):
    __tablename__ = "lineage_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    version = Column(Integer, nullable=False)
    delta_id = Column(String, nullable=False)
    step = Column(String, nullable=False)
    event_type = Column(String, nullable=False, default="apply")
    affected_plans = Column(Text, nullable=False, default="[]")
    detail = Column(Text, nullable=True)


# ── Store ─────────────────────────────────────────────────────────────

class LineageStore:
    """Append-only lineage event recorder."""

    def record(
        self,
        version: int,
        delta_id: str,
        step: str,
        event_type: str = "apply",
        affected_plans: Optional[list[str]] = None,
        detail: Optional[str] = None,
    ) -> None:
        """Record a single lineage event.

        Args:
            version: Kernel version at this event.
            delta_id: Associated KernelDelta ID.
            step: Which reduce step produced this event.
            event_type: 'apply' | 'error' | 'reconstruct'.
            affected_plans: Plans affected.
            detail: Optional detail message.
        """
        _log.debug("LineageStore.record: version=%d delta=%s step=%s",
                   version, delta_id, step)
        db = SessionLocal()
        try:
            row = LineageRow(
                version=version,
                delta_id=delta_id,
                step=step,
                event_type=event_type,
                affected_plans=json.dumps(affected_plans or []),
                detail=detail,
            )
            db.add(row)
            db.commit()
        except Exception:
            db.rollback()
            _log.error("LineageStore.record: failed version=%d delta=%s",
                       version, delta_id)
            raise
        finally:
            db.close()

    def get_events(
        self,
        version: Optional[int] = None,
        limit: int = 100,
    ) -> List[dict]:
        """Retrieve lineage events.

        Args:
            version: Optional version filter.
            limit: Max events (default 100).

        Returns:
            List of event dicts.
        """
        db = SessionLocal()
        try:
            query = db.query(LineageRow)
            if version is not None:
                query = query.filter(LineageRow.version == version)
            rows = query.order_by(LineageRow.id.desc()).limit(limit).all()
            return [
                {
                    "id": r.id,
                    "version": r.version,
                    "delta_id": r.delta_id,
                    "step": r.step,
                    "event_type": r.event_type,
                    "affected_plans": json.loads(r.affected_plans or "[]"),
                    "detail": r.detail,
                }
                for r in rows
            ]
        finally:
            db.close()
