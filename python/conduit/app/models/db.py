"""
SQLAlchemy database setup for the WRP Kernel Runtime.

Design principle (from kernel-projection-answers.md):
    Kernel = pure deterministic logic
    Storage = dirty, retryable persistence layer

The engine NEVER imports SQLAlchemy. Storage layer translates
between DB types and KernelDelta/KernelState domain types.

Uses the same CONDUIT_PG_DSN env var as the rest of the conduit system.
"""

import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

_log = logging.getLogger("kernel.db")

# ── Connection string ────────────────────────────────────────────────

def _build_dsn() -> str:
    """Build a SQLAlchemy DSN from CONDUIT_PG_DSN-style env var.

    CONDUIT_PG_DSN format:
        host=localhost port=5432 user=pguser password=pgpass dbname=nexus
    """
    raw = os.environ.get("CONDUIT_PG_DSN", "")
    if raw:
        # Parse key=value pairs
        parts = dict(p.split("=", 1) for p in raw.strip().split())
        host = parts.get("host", "localhost")
        port = parts.get("port", "5432")
        user = parts.get("user", "pguser")
        password = parts.get("password", "pgpass")
        dbname = parts.get("dbname", "nexus")
        return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{dbname}"

    # Fallback defaults
    _log.warning("CONDUIT_PG_DSN not set, using defaults: pguser@localhost:5432/nexus")
    return "postgresql+psycopg2://pguser:pgpass@localhost:5432/nexus"


DATABASE_URL = _build_dsn()

engine = create_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency — yields a session and closes it on completion."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
