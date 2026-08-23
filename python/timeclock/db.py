"""
Database connection and session management for the timeclock service.
"""

import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base

_log = logging.getLogger("timeclock.db")


def _build_dsn() -> str:
    """Build a SQLAlchemy DSN from environment or defaults."""
    raw = os.environ.get("CONDUIT_PG_DSN", "")
    if raw:
        # Accept both DSN styles seen in deploy .env files:
        #   URI:     postgres://user:pass@host:port/db
        #   keyword: host=... port=... user=... password=... dbname=...
        if "://" in raw:
            uri = raw
            if uri.startswith("postgres://"):
                uri = "postgresql://" + uri[len("postgres://"):]
            if uri.startswith("postgresql://"):
                uri = uri.replace("postgresql://", "postgresql+psycopg2://", 1)
            return uri
        parts = dict(p.split("=", 1) for p in raw.strip().split())
        host = parts.get("host", "localhost")
        port = parts.get("port", "5432")
        user = parts.get("user", "pguser")
        password = parts.get("password", "pgpass")
        dbname = parts.get("dbname", "nexus")
        return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{dbname}"

    _log.warning("CONDUIT_PG_DSN not set, using defaults")
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


def get_db():
    """FastAPI dependency — yields a session and closes it on completion."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create tables if they don't exist."""
    Base.metadata.create_all(bind=engine)
    _log.info("Timeclock tables verified")
