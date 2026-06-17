from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime, timezone
import uuid

import time
import socket

SpanType = Literal[
    "STRUCTURAL",
    "DISCOURSE",
    "EVENT_CANDIDATE",
    "NOISE",
]

DriftMagnitude = Literal[
    "TRACE",   # e.g. mtime change only
    "MINOR",   # e.g. < 5% size change
    "MAJOR",   # e.g. 5-25% size change
    "MASSIVE", # e.g. > 25% size change
]

SemanticImpact = Literal[
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL",
]

class Actor:
    def __init__(self, id: str = None, type: str = "service"):
        import socket
        self.id = id or f"voyager-{socket.gethostname()}"
        self.type = type

    def to_dict(self) -> dict:
        return {"id": self.id, "type": self.type}

class Intent:
    def __init__(self, action: str = "observe", target_type: str = "file"):
        self.action = action
        self.target_type = target_type

    def to_dict(self) -> dict:
        return {"action": self.action, "target_type": self.target_type}

# ── NOTE: CEREnvelope has been migrated to CanonicalEnvelope ──
# See nats_envelope/envelope.py for the unified envelope.
# Use voyager_envelope_adapter.create_envelope() for construction.

class FileObservation(BaseModel):
    observation_id: str
    path: str
    size: int
    mtime: str
    inode: int
    device_id: int
    content_hash: Optional[str] = None

class PhysicalFingerprint(BaseModel):
    device_id: int
    inode: int
    size: int
    mtime: str

    def to_key(self) -> tuple:
        return (self.device_id, self.inode, self.size, self.mtime)

class DirectoryObservation(BaseModel):
    observation_id: str
    path: str
    inode: int
    device_id: int

class TopologySignal(BaseModel):
    signal_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    observation_ids: List[str]
    structure: Dict[str, str]  # type, scope
    geometry: Dict[str, Any]
    constraints: Dict[str, bool] = Field(default_factory=lambda: {"purely_structural": True})

class ObservationEdgeHint(BaseModel):
    hint_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    observation_ids: List[str]
    evidence: Dict[str, Any] # type, confidence

class MetadataSpan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    start: int
    end: int
    span_type: SpanType
    confidence: float
    markdown_role: Optional[str] = None
    discourse_role: Optional[str] = None
    event_candidate: bool = False
    features: Dict[str, Any] = Field(default_factory=dict)
    provenance: Dict[str, Any] = Field(default_factory=dict)

class MetadataSpanEmitted(BaseModel):
    observation_id: str
    span: MetadataSpan

class IdentityCandidate(BaseModel):
    candidate_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    observation_ids: List[str]
    evidence: Dict[str, Any] # structural, topology
    confidence: float

class Entity(BaseModel):
    entity_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    canonical_observations: List[str]
    lineage: Dict[str, Any] # root_observation, transformation_chain
    stability_score: float

class RequirementCandidate(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    provenance: List[str] # entity_ids
    confidence: float

class EntityDrift(BaseModel):
    drift_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    entity_id: str
    observation_id: str
    delta: Dict[str, Any] # e.g. {"size": {"old": 100, "new": 120}}
    magnitude: DriftMagnitude
    confidence: float
