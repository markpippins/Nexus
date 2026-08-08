import os
from functools import lru_cache


class Settings:
    postgres_dsn: str = os.environ.get(
        "NEBULA_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus"
    )
    redis_url: str = os.environ.get("NEBULA_REDIS_URL", "redis://localhost:6379/0")
    # Safety-net TTL only — cache is actively invalidated on every write path,
    # this just bounds staleness if an invalidation is ever missed.
    redis_ttl_seconds: int = int(os.environ.get("NEBULA_SEGSET_CACHE_TTL", "3600"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
