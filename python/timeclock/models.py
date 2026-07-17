"""
SQLAlchemy models for the agent timeclock system.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, Text, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class AgentTimeclock(Base):
    __tablename__ = "agent_timeclock"
    __table_args__ = {"schema": "nebula"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role = Column(Text, nullable=False, index=True)
    model = Column(Text, nullable=False)
    session_id = Column(Text)
    clock_in = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    clock_out = Column(DateTime(timezone=True))
    status = Column(Text, nullable=False, server_default="active", index=True)
    metadata_ = Column("metadata", JSONB)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    recorded_on_dt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    valid_from = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    valid_until = Column(DateTime(timezone=True), nullable=False, default=datetime(9999, 12, 31, 23, 59, 59, tzinfo=timezone.utc))

    def to_dict(self):
        return {
            "id": str(self.id),
            "role": self.role,
            "model": self.model,
            "session_id": self.session_id,
            "clock_in": self.clock_in.isoformat() if self.clock_in else None,
            "clock_out": self.clock_out.isoformat() if self.clock_out else None,
            "status": self.status,
            "metadata": self.metadata_,
            "duration_seconds": (
                (self.clock_out - self.clock_in).total_seconds()
                if self.clock_out and self.clock_in
                else (datetime.now(timezone.utc) - self.clock_in).total_seconds()
                if self.clock_in
                else 0
            ),
        }
