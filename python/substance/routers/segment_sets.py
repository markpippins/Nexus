import uuid

from fastapi import APIRouter, HTTPException

from .. import cache
from .. import repository as repo
from ..schemas import (
    MembersAddIn,
    ResolvedSegment,
    SegmentSetCreate,
    SegmentSetFromSegmentsCreate,
    SegmentSetOut,
    SegmentSetUpdate,
)

router = APIRouter(prefix="/segment-sets", tags=["segment-sets"])


async def _resolve(segment_set_id: uuid.UUID) -> SegmentSetOut:
    """Build the full resolved view of a segment set straight from Postgres.
    Callers that want the cache should use `_cached_resolve` instead."""
    row = await repo.get_segment_set(segment_set_id)
    if row is None:
        raise HTTPException(status_code=404, detail="segment set not found")
    members = await repo.list_resolved_segments(segment_set_id)
    return SegmentSetOut(
        **dict(row),
        segments=[ResolvedSegment(**dict(m)) for m in members],
    )


async def cached_resolve(segment_set_id: uuid.UUID) -> SegmentSetOut:
    """Read-through cache: nexus:segset:{id} in Redis, falling back to
    Postgres and repopulating on a miss."""
    cached = await cache.get_segset(segment_set_id)
    if cached is not None:
        return SegmentSetOut(**cached)
    resolved = await _resolve(segment_set_id)
    await cache.set_segset(segment_set_id, resolved.model_dump(mode="json"))
    return resolved


@router.post("", response_model=SegmentSetOut, status_code=201)
async def create_segment_set(body: SegmentSetCreate):
    row = await repo.create_segment_set(body.name, body.description, body.metadata)
    if body.members:
        await repo.add_members(row["id"], [m.model_dump() for m in body.members])
    return await _resolve(row["id"])


@router.get("/{segment_set_id}", response_model=SegmentSetOut)
async def read_segment_set(segment_set_id: uuid.UUID):
    return await cached_resolve(segment_set_id)


@router.patch("/{segment_set_id}", response_model=SegmentSetOut)
async def update_segment_set(segment_set_id: uuid.UUID, body: SegmentSetUpdate):
    fields = body.model_dump(exclude_unset=True)
    row = await repo.update_segment_set(segment_set_id, fields)
    if row is None:
        raise HTTPException(status_code=404, detail="segment set not found")
    await cache.invalidate_segset(segment_set_id)
    return await _resolve(segment_set_id)


@router.post("/{segment_set_id}/members", response_model=SegmentSetOut)
async def add_members(segment_set_id: uuid.UUID, body: MembersAddIn):
    existing = await repo.get_segment_set(segment_set_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="segment set not found")
    await repo.add_members(segment_set_id, [m.model_dump() for m in body.segments])
    await cache.invalidate_segset(segment_set_id)
    return await _resolve(segment_set_id)


@router.delete("/{segment_set_id}/members/{segment_id}", response_model=SegmentSetOut)
async def remove_member(segment_set_id: uuid.UUID, segment_id: uuid.UUID):
    await repo.exclude_member(segment_set_id, segment_id)
    await cache.invalidate_segset(segment_set_id)
    return await _resolve(segment_set_id)


@router.post("/from-segments", response_model=SegmentSetOut, status_code=201)
async def create_from_segments(body: SegmentSetFromSegmentsCreate):
    """Create a segment set + segments_history rows + members from
    pre-computed discourse-arc segments (from discourse_segmenter).
    Atomic — all-or-nothing."""
    row = await repo.create_segment_set_from_segments(
        name=body.name,
        description=body.description,
        metadata=body.metadata,
        conversation_id=body.conversation_id,
        snapshot_id=body.snapshot_id,
        segments=[s.model_dump() for s in body.segments],
    )
    return await _resolve(row["id"])
