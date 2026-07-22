import uuid

from fastapi import APIRouter, HTTPException

from .. import cache
from .. import repository as repo
from ..schemas import DomainLinkIn, DomainLinkOut, DomainType
from .segment_sets import cached_resolve

router = APIRouter(tags=["domain-links"])


@router.post(
    "/{domain_type}/{domain_id}/segment-sets",
    response_model=DomainLinkOut,
    status_code=201,
)
async def link_segment_set(domain_type: DomainType, domain_id: uuid.UUID, body: DomainLinkIn):
    segset = await repo.get_segment_set(body.segment_set_id)
    if segset is None:
        raise HTTPException(status_code=404, detail="segment set not found")
    await repo.link_domain(domain_type, domain_id, body.segment_set_id, body.role)
    await cache.invalidate_domain_index(domain_type, domain_id)
    resolved = await cached_resolve(body.segment_set_id)
    return DomainLinkOut(
        segment_set_id=body.segment_set_id, role=body.role, active=True, segment_set=resolved
    )


@router.get("/{domain_type}/{domain_id}/segment-sets", response_model=list[DomainLinkOut])
async def list_segment_sets(domain_type: DomainType, domain_id: uuid.UUID):
    links = await repo.list_domain_links(domain_type, domain_id)
    out = []
    for link in links:
        resolved = await cached_resolve(link["segment_set_id"])
        out.append(
            DomainLinkOut(
                segment_set_id=link["segment_set_id"],
                role=link["role"],
                active=link["active"],
                segment_set=resolved,
            )
        )
    return out


@router.delete(
    "/{domain_type}/{domain_id}/segment-sets/{segment_set_id}", status_code=204
)
async def unlink_segment_set(
    domain_type: DomainType, domain_id: uuid.UUID, segment_set_id: uuid.UUID
):
    await repo.unlink_domain(domain_type, domain_id, segment_set_id)
    await cache.invalidate_domain_index(domain_type, domain_id)
    return None
