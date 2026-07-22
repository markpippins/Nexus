"""
Database connection management for Redis, MongoDB, and MySQL

Redis Resilience Strategy
────────────────────────
- Non-fatal startup:  if Redis is unavailable at boot, the service starts
  and retries on first operation (safe_redis_op returns defaults).
- Health-check interval:  the client proactively checks connection health
  every 30 s, replacing stale connections before operations hit them.
- Retry policy:  transient ConnectionError/TimeoutError are retried up to
  3 times with exponential backoff (1s → 2s → 4s, capped at 10s).
- Reconnection:  ensure_redis_healthy() attempts to rebuild the client if
  the connection is lost, so brief outages self-heal without restart.
"""

import asyncio
from typing import Optional, Any, Callable
from functools import wraps

from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis
from redis.backoff import ExponentialBackoff
from redis.retry import Retry
from redis.exceptions import (
    ConnectionError as RedisConnectionError,
    TimeoutError as RedisTimeoutError,
    ResponseError as RedisResponseError,
)
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
import structlog

# Handle imports differently when run as a script vs module
try:
    from .config import settings
except ImportError:
    # When run as a script, use absolute imports
    import sys
    from pathlib import Path
    sys.path.append(str(Path(__file__).parent))  # Same directory

    from config import settings

logger = structlog.get_logger()

# ── Retry / timeout constants ──────────────────────────────────────────
REDIS_SOCKET_TIMEOUT = 5.0
REDIS_SOCKET_CONNECT_TIMEOUT = 5.0
REDIS_MAX_CONNECTIONS = 10
REDIS_HEALTH_CHECK_INTERVAL = 30
REDIS_RETRY_ATTEMPTS = 3
# Errors that trigger a retry under the Retry policy
_REDIS_RETRY_ON_ERRORS = [
    RedisConnectionError,
    RedisTimeoutError,
    RedisResponseError,
]

# Database instances
redis_client: Optional[redis.Redis] = None
mongodb_client: Optional[AsyncIOMotorClient] = None
mongodb_db = None
mysql_engine = None
async_session_maker = None

# Reconnection guard — prevents concurrent reconnection attempts
_redis_reconnecting: bool = False

# SQLAlchemy base
Base = declarative_base()


async def safe_redis_op(coro_factory: Callable, default: Any = None,
                         operation: str = "redis_op") -> Any:
    """Execute a Redis operation with ConnectionError handling.

    Retries are handled by the client's built-in Retry policy (configured
    in init_databases).  This function handles errors that survive retry
    so callers can degrade gracefully instead of propagating exceptions.

    Args:
        coro_factory: Callable that returns an awaitable (e.g. lambda: client.hget(k, f))
        default: Value to return on ConnectionError (None = silent degradation)
        operation: Label for logging on failure

    Returns:
        Result of the operation, or default on ConnectionError.
    """
    try:
        return await coro_factory()
    except RedisConnectionError as e:
        logger.warning("redis_connection_error", operation=operation, error=str(e))
        return default
    except RedisTimeoutError as e:
        logger.warning("redis_timeout", operation=operation, error=str(e))
        return default
    except OSError as e:
        # Lower-level socket errors (e.g. "Connection reset by peer") that
        # may not be wrapped by redis-py in some transport scenarios.
        logger.warning("redis_os_error", operation=operation, error=str(e))
        return default
    except AttributeError:
        # guards against redis_client being None during startup or
        # reconnection — not a normal operational error.
        logger.error("redis_client_uninitialized", operation=operation)
        return default


async def init_databases():
    """Initialize all database connections.

    Redis ping failure is non-fatal: the client is still created so
    auto-reconnect can succeed on the next operation.  MongoDB and
    MySQL failures remain fatal (service cannot run without them).

    Redis client is configured with:
    - retry_on_timeout=True
    - health_check_interval=30 s  (proactive stale-connection detection)
    - ExponentialBackoff  (1s → 2s → 4s, max 10s) × 3 retries
    - socket timeout & connect timeout of 5 s each
    """
    global redis_client, mongodb_client, mongodb_db, mysql_engine, async_session_maker

    try:
        # Initialize Redis — ping is non-fatal
        redis_client = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            retry_on_timeout=True,
            socket_timeout=REDIS_SOCKET_TIMEOUT,
            socket_connect_timeout=REDIS_SOCKET_CONNECT_TIMEOUT,
            max_connections=REDIS_MAX_CONNECTIONS,
            health_check_interval=REDIS_HEALTH_CHECK_INTERVAL,
            retry=Retry(ExponentialBackoff(cap=10, base=1), REDIS_RETRY_ATTEMPTS),
            retry_on_error=_REDIS_RETRY_ON_ERRORS,
        )
        try:
            await redis_client.ping()
            logger.info("Redis connection established")
        except (RedisConnectionError, RedisTimeoutError, OSError) as e:
            logger.warning(
                "Redis unavailable at startup, will reconnect on first operation",
                error=str(e),
            )

        # Initialize MongoDB
        mongodb_client = AsyncIOMotorClient(settings.mongodb_url)
        mongodb_db = mongodb_client[settings.mongodb_database]
        # Test connection
        await mongodb_client.admin.command('ping')
        logger.info("MongoDB connection established")

        # Initialize MySQL with async support
        # Convert mysql:// to mysql+aiomysql://
        mysql_url = settings.mysql_url.replace("mysql://", "mysql+aiomysql://")
        mysql_engine = create_async_engine(mysql_url, echo=False)
        async_session_maker = async_sessionmaker(mysql_engine, expire_on_commit=False)

        # Test MySQL connection
        async with async_session_maker() as session:
            await session.execute(text("SELECT 1"))
        logger.info("MySQL connection established")

    except Exception as e:
        logger.error("Failed to initialize databases", error=str(e))
        raise


async def ensure_redis_healthy() -> bool:
    """Check Redis health and attempt reconnection if unhealthy.

    If the ping succeeds the existing client is reused.  On failure a
    *new* client is created with the same retry configuration, so the
    service can recover from Redis restarts without a full restart.

    A reconnection-in-progress flag prevents concurrent coroutines from
    both attempting to rebuild the client at the same time.

    Returns:
        True if Redis is healthy (or reconnected successfully).
    """
    global redis_client, _redis_reconnecting

    if redis_client is None:
        logger.error("Redis client not initialized")
        return False

    try:
        await redis_client.ping()
        return True
    except (RedisConnectionError, RedisTimeoutError, OSError) as e:
        logger.warning(
            "Redis ping failed, attempting reconnection",
            error=str(e),
        )

    # If another coroutine is already reconnecting, wait and retry
    if _redis_reconnecting:
        logger.debug("redis_reconnect_already_in_progress")
        for attempt in range(5):
            await asyncio.sleep(1)
            try:
                await redis_client.ping()
                return True
            except (RedisConnectionError, RedisTimeoutError, OSError):
                continue
        return False

    _redis_reconnecting = True
    try:
        new_client = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            retry_on_timeout=True,
            socket_timeout=REDIS_SOCKET_TIMEOUT,
            socket_connect_timeout=REDIS_SOCKET_CONNECT_TIMEOUT,
            max_connections=REDIS_MAX_CONNECTIONS,
            health_check_interval=REDIS_HEALTH_CHECK_INTERVAL,
            retry=Retry(ExponentialBackoff(cap=10, base=1), REDIS_RETRY_ATTEMPTS),
            retry_on_error=_REDIS_RETRY_ON_ERRORS,
        )
        await new_client.ping()
        # swap the global reference so all subsequent callers see the new client
        old = redis_client
        redis_client = new_client
        await old.close()
        logger.info("Redis reconnection successful — client replaced")
        return True
    except Exception as reconnect_error:
        logger.error(
            "Redis reconnection failed",
            error=str(reconnect_error),
        )
        return False
    finally:
        _redis_reconnecting = False


async def close_databases():
    """Close all database connections"""
    global redis_client, mongodb_client, mysql_engine
    
    if redis_client:
        await redis_client.close()
        logger.info("Redis connection closed")
    
    if mongodb_client:
        mongodb_client.close()
        logger.info("MongoDB connection closed")
    
    if mysql_engine:
        await mysql_engine.dispose()
        logger.info("MySQL connection closed")


def get_redis() -> redis.Redis:
    """Get Redis client instance.

    The returned client has built-in retry and health-checking configured
    (see init_databases).  Callers that can tolerate Redis being down
    should wrap operations with safe_redis_op() for graceful fallback.

    Raises:
        RuntimeError: if the client has not been initialised.
    """
    if redis_client is None:
        raise RuntimeError("Redis client not initialized")
    return redis_client


async def get_redis_healthy() -> Optional[redis.Redis]:
    """Get Redis client, attempting reconnection if unhealthy.

    Unlike get_redis() this will *try* to heal a broken connection
    before returning.  Callers that can tolerate Redis being down
    should still wrap operations with safe_redis_op().

    Returns:
        The Redis client if healthy, or None if unavailable.
    """
    if redis_client is None:
        raise RuntimeError("Redis client not initialized")
    if await ensure_redis_healthy():
        return redis_client
    return None


def get_mongodb():
    """Get MongoDB database instance"""
    if mongodb_db is None:
        raise RuntimeError("MongoDB client not initialized")
    return mongodb_db


async def get_mysql_session() -> AsyncSession:
    """Get MySQL session"""
    if async_session_maker is None:
        raise RuntimeError("MySQL engine not initialized")
    return async_session_maker()