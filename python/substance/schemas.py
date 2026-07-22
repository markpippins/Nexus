import datetime as dt
import uuid
from typing import Literal, Optional

from pydantic import BaseModel, Field

Role = Literal["primary", "supporting"]
DomainType = Literal["candidates", "intent-records", "requirements"]


class SegmentMemberIn(BaseModel):
    segment_id: uuid.UUID
    ordinal: int
    note: Optional[str] = None


class SegmentSetCreate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    metadata: dict = Field(default_factory=dict)
    members: list[SegmentMemberIn] = Field(default_factory=list)


class SegmentSetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[Literal["active", "archived"]] = None
    metadata: Optional[dict] = None


class ResolvedSegment(BaseModel):
    segment_id: uuid.UUID
    ordinal: int
    note: Optional[str] = None
    conversation_id: Optional[uuid.UUID] = None
    start_block_index: Optional[int] = None
    end_block_index: Optional[int] = None
    segment_type: Optional[str] = None
    title: Optional[str] = None


class SegmentSetOut(BaseModel):
    id: uuid.UUID
    name: Optional[str] = None
    description: Optional[str] = None
    status: str
    metadata: dict
    created_at: dt.datetime
    updated_at: dt.datetime
    segments: list[ResolvedSegment]


class MembersAddIn(BaseModel):
    segments: list[SegmentMemberIn]


class DomainLinkIn(BaseModel):
    segment_set_id: uuid.UUID
    role: Role = "primary"


class DomainLinkOut(BaseModel):
    segment_set_id: uuid.UUID
    role: Role
    active: bool
    segment_set: Optional[SegmentSetOut] = None
