import datetime as dt
import json
import uuid
from typing import Any, Optional

import redis.asyncio as redis

from .config import get_settings

_client: Optional[redis.Redis] = None


def get_client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(get_settings().redis_url, decode_responses=True)
    return _client


def _segset_key(segment_set_id: uuid.UUID | str) -> str:
    return f"nexus:segset:{segment_set_id}"


def _domain_index_key(domain_type: str, domain_id: uuid.UUID | str) -> str:
    return f"nexus:{domain_type}:{domain_id}:segsets"


class _JSONEncoder(json.JSONEncoder):
    def default(self, o: Any) -> Any:
        if isinstance(o, uuid.UUID):
            return str(o)
        if isinstance(o, (dt.datetime, dt.date)):
            return o.isoformat()
        return super().default(o)


async def get_segset(segment_set_id: uuid.UUID) -> Optional[dict]:
    raw = await get_client().get(_segset_key(segment_set_id))
    return json.loads(raw) if raw else None


async def set_segset(segment_set_id: uuid.UUID, payload: dict) -> None:
    ttl = get_settings().redis_ttl_seconds
    await get_client().set(
        _segset_key(segment_set_id), json.dumps(payload, cls=_JSONEncoder), ex=ttl
    )


async def invalidate_segset(segment_set_id: uuid.UUID) -> None:
    await get_client().delete(_segset_key(segment_set_id))


async def invalidate_domain_index(domain_type: str, domain_id: uuid.UUID) -> None:
    await get_client().delete(_domain_index_key(domain_type, domain_id))
