from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid


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
    evidence: Dict[str, Any]  # type, confidence
