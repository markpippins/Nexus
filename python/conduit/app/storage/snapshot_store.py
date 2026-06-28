"""
Snapshot persistence — SQLAlchemy ORM + Store for KernelSnapshot rows.

Design principle (kernel-projection-answers.md section 4.2):
    Snapshots are check-pointed KernelState for fast reconstruction.
    They are an acceleration layer, NOT the source of truth.
    Source of truth is the kernel_delta_log.
"""

import json
import logging
from typing import Optional

from sqlalchemy import Column, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB

from app.models.db import Base, SessionLocal

_log = logging.getLogger("kernel.snapshot_store")


# ── ORM row model ────────────────────────────────────────────────────

class KernelSnapshotRow(Base):
    __tablename__ = "kernel_snapshot"

    version = Column(Integer, primary_key=True)
    state = Column(JSONB, nullable=False)
    identity_hash = Column(Text, nullable=True)
    graph_hash = Column(Text, nullable=True)
    lineage_cursor = Column(Integer, nullable=True)


# ── Store ─────────────────────────────────────────────────────────────

class SnapshotStore:
    """Persistence wrapper for KernelSnapshot checkpoints."""

    def save(self, version: int, state: dict) -> None:
        """Persist a snapshot at the given version. Idempotent (merge)."""
        _log.debug("SnapshotStore.save: version=%d", version)
        db = SessionLocal()
        try:
            row = KernelSnapshotRow(
                version=version,
                state=state,
            )
            db.merge(row)
            db.commit()
            _log.info("SnapshotStore.save: committed version=%d", version)
        except Exception:
            db.rollback()
            _log.error("SnapshotStore.save: failed version=%d", version)
            raise
        finally:
            db.close()

    def latest(self) -> Optional[dict]:
        """Get the highest-version snapshot, or None if no snapshots exist.

        Returns:
            The state dict, or None.
        """
        db = SessionLocal()
        try:
            row = (
                db.query(KernelSnapshotRow)
                .order_by(KernelSnapshotRow.version.desc())
                .first()
            )
            if row is None:
                _log.debug("SnapshotStore.latest: no snapshots found")
                return None
            _log.debug("SnapshotStore.latest: version=%d", row.version)
            return row.state
        finally:
            db.close()

    def get_nearest(self, target_version: int) -> Optional[dict]:
        """Get the nearest snapshot with version ≤ target_version.

        For KSRA: KernelState(N) = Snapshot(K) + Replay(deltas K+1 → N)
        where K = this method's result version.

        Args:
            target_version: Target version to reconstruct to.

        Returns:
            Nearest ancestor state dict, or None.
        """
        db = SessionLocal()
        try:
            row = (
                db.query(KernelSnapshotRow)
                .filter(KernelSnapshotRow.version <= target_version)
                .order_by(KernelSnapshotRow.version.desc())
                .first()
            )
            if row is None:
                _log.debug("SnapshotStore.get_nearest: none ≤ %d", target_version)
                return None
            _log.debug("SnapshotStore.get_nearest: version=%d for target=%d",
                       row.version, target_version)
            return row.state
        finally:
            db.close()
