import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import Column, DateTime, Enum as SAEnum, Integer, String, Text, Float, JSON
from sqlalchemy.orm import declarative_base

from losm_ir.states import WorkStatus

Base = declarative_base()


class ArtifactType(str, Enum):
    PLAN = "PLAN"
    CRITIQUE = "CRITIQUE"
    SPEC = "SPEC"
    EXECUTION = "EXECUTION"
    PATCH = "PATCH"
    SUMMARY = "SUMMARY"


class PlanningTask(Base):
    __tablename__ = "work_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    wr_id = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    intent = Column(Text, nullable=False)
    constraints = Column(JSON, nullable=True)
    priority = Column(Integer, default=5, nullable=False)
    context_data = Column("context", JSON, nullable=True)
    status = Column(SAEnum(WorkStatus), default=WorkStatus.NEW, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<PlanningTask wr_id={self.wr_id} status={self.status} intent={self.intent[:30]!r}>"


class Artifact(Base):
    __tablename__ = "artifacts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    artifact_id = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    type = Column(SAEnum(ArtifactType), nullable=False)
    content = Column(JSON, nullable=False)
    confidence = Column(Float, nullable=True)
    provenance = Column(JSON, nullable=True)
    wr_id = Column(String(36), nullable=True, index=True)
    parent_artifact_id = Column(String(36), nullable=True, index=True)
    template_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<Artifact artifact_id={self.artifact_id} type={self.type}>"


class ReceiptIngestRecord(Base):
    __tablename__ = "receipt_ingest_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    receipt_id = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    work_request_id = Column(String(64), nullable=False, index=True)
    executor_id = Column(String(128), nullable=False)
    receipt_hash = Column(String(64), unique=True, nullable=False, index=True)
    result = Column(String(16), nullable=False)
    lineage_parent = Column(String(128), nullable=False)
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class GovernanceEvent(Base):
    __tablename__ = "governance_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    event_type = Column(String(64), nullable=False)
    work_request_id = Column(String(64), nullable=False, index=True)
    lineage_parent = Column(String(128), nullable=True)
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class LifecycleEvent(Base):
    __tablename__ = "lifecycle_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    wr_id = Column(String(36), nullable=False, index=True)
    from_state = Column(SAEnum(WorkStatus), nullable=True)
    to_state = Column(SAEnum(WorkStatus), nullable=False)
    actor = Column(String(128), nullable=False)
    reason = Column(String(256), nullable=True)
    metadata_payload = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<LifecycleEvent wr_id={self.wr_id} {self.from_state}->{self.to_state}>"


class Branch(Base):
    __tablename__ = "branches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    branch_id = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    wr_id = Column(String(36), nullable=False, index=True)
    parent_branch_id = Column(String(36), nullable=True)
    fork_point = Column(String(36), nullable=True)
    label = Column(String(64), nullable=True)
    score = Column(Float, nullable=True)
    status = Column(String(32), default="active", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<Branch {self.branch_id} wr={self.wr_id} label={self.label}>"


class BranchArtifact(Base):
    __tablename__ = "branch_artifacts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    artifact_id = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    branch_id = Column(String(36), nullable=False, index=True)
    wr_id = Column(String(36), nullable=False, index=True)
    artifact_type = Column(String(32), nullable=False)
    content = Column(Text, nullable=False)
    parent_artifact_id = Column(String(36), nullable=True)
    score = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<BranchArtifact {self.artifact_id} branch={self.branch_id} type={self.artifact_type}>"
