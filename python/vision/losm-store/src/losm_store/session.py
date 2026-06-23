import os

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

DEFAULT_DATABASE_URL = os.environ.get(
    "LOSM_DATABASE_URL",
    "postgresql://pguser:pgpass@localhost:5432/nexus"
)

engine = create_engine(DEFAULT_DATABASE_URL, echo=False)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)



def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


__all__ = ["engine", "SessionLocal", "DEFAULT_DATABASE_URL", "get_db"]
