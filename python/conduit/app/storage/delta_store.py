"""
Delta persistence — SQLAlchemy ORM + Store for KernelDelta rows.

Design principle (kernel-projection-answers.md section 4.1):
    Delta Store persists every KernelDelta before it reaches the engine.
    The delta log is the source of truth — snapshots are derived.
"""

import json
import logging
from typing import Optional

from sqlalchemy import Column, String, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB

from app.models.db import Base, SessionLocal
from wrp_kernel.delta import KernelDelta

_log = logging.getLogger("kernel.delta_store")


# ── ORM row model ────────────────────────────────────────────────────

class KernelDeltaRow(Base):
    __tablename__ = "kernel_delta_log"
    __table_args__ = {"schema": "conduit"}

    delta_id = Column(String, primary_key=True)
    batch_id = Column(String, nullable=False)
    payload = Column(JSONB, nullable=False)
    version = Column(Integer, nullable=False, default=0)

    def to_domain(self) -> KernelDelta:
        """Translate DB row → domain KernelDelta."""
        payload = self.payload or {}
        return KernelDelta(
            delta_id=self.delta_id,
            batch_id=self.batch_id,
            version=self.version,
            receipts=payload.get("receipts", []),
            affected_plans=set(payload.get("affected_plans", [])),
            invalidated_plans=set(payload.get("invalidated_plans", [])),
        )

    @staticmethod
    def from_domain(delta: KernelDelta) -> "KernelDeltaRow":
        """Translate domain KernelDelta → DB row."""
        return KernelDeltaRow(
            delta_id=delta.delta_id,
            batch_id=delta.batch_id,
            version=delta.version,
            payload={
                "receipts": delta.receipts,
                "affected_plans": list(delta.affected_plans),
                "invalidated_plans": list(delta.invalidated_plans),
            },
        )


# ── Store ─────────────────────────────────────────────────────────────

class DeltaStore:
    """Persistence wrapper for KernelDelta rows.

    Uses SQLAlchemy sessions. NEVER imported by the kernel engine.
    """

    def save(self, delta: KernelDelta) -> None:
        """Persist a KernelDelta to the delta log. Idempotent (merge)."""
        _log.debug("DeltaStore.save: delta_id=%s version=%d", delta.delta_id, delta.version)
        db = SessionLocal()
        try:
            row = KernelDeltaRow.from_domain(delta)
            db.merge(row)
            db.commit()
            _log.info("DeltaStore.save: committed delta_id=%s", delta.delta_id)
        except Exception:
            db.rollback()
            _log.error("DeltaStore.save: failed delta_id=%s", delta.delta_id)
            raise
        finally:
            db.close()

    def load_after(self, version: int, limit: int = 1000) -> list[KernelDelta]:
        """Load all deltas with version > given version, ordered ascending.

        Args:
            version: Lower bound (exclusive).
            limit: Max rows to return.

        Returns:
            List of KernelDelta domain objects.
        """
        _log.debug("DeltaStore.load_after: since_version=%d limit=%d", version, limit)
        db = SessionLocal()
        try:
            rows = (
                db.query(KernelDeltaRow)
                .filter(KernelDeltaRow.version > version)
                .order_by(KernelDeltaRow.version.asc())
                .limit(limit)
                .all()
            )
            return [r.to_domain() for r in rows]
        finally:
            db.close()

    def count(self) -> int:
        """Total delta log entries."""
        db = SessionLocal()
        try:
            return db.query(KernelDeltaRow).count()
        finally:
            db.close()
