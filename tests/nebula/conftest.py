"""Pytest fixtures for nebula E2E tests."""

import os
import sys
from pathlib import Path

import pytest
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.errors import InsufficientPrivilege, DuplicateDatabase
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

TEST_DIR = Path(__file__).parent
SCHEMA_FILE = TEST_DIR / "schema.sql"
TEST_DB = "nebula_test"
TEST_SCHEMA = "nebula"


def _load_dsn():
    dsn = os.environ.get("NEBULA_PG_DSN", "")
    if not dsn:
        env_file = Path(__file__).parent.parent.parent / "python" / "conduit" / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                line = line.strip()
                if line.startswith("CONDUIT_PG_DSN="):
                    dsn = line.split("=", 1)[1].strip()
                    break
    if not dsn:
        pytest.skip("NEBULA_PG_DSN not set and no .env found")
    return dsn


def _parse_dsn(dsn: str) -> dict:
    result = {}
    for pair in dsn.strip().split():
        if "=" not in pair:
            continue
        k, _, v = pair.partition("=")
        result[k] = v
    return result


def _ensure_test_db():
    dsn = _load_dsn()
    cfg = _parse_dsn(dsn)
    host, port, user, password = (
        cfg.get("host", "localhost"),
        cfg.get("port", "5433"),
        cfg.get("user", ""),
        cfg.get("password", ""),
    )
    try:
        admin = psycopg2.connect(
            host=host, port=port, user=user, password=password, dbname="postgres"
        )
        admin.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = admin.cursor()
        res = cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB,))
        exists = cur.fetchone() is not None
        if not exists:
            cur.execute(f"CREATE DATABASE {TEST_DB}")
        cur.close()
        admin.close()
    except InsufficientPrivilege:
        pass
    return host, port, user, password


def _apply_schema(dbname: str):
    sql = SCHEMA_FILE.read_text()
    conn = psycopg2.connect(
        host=_ensure_test_db()[0],
        port=_ensure_test_db()[1],
        user=_ensure_test_db()[2],
        password=_ensure_test_db()[3],
        dbname=dbname,
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    cur.execute(sql)
    cur.close()
    conn.close()


@pytest.fixture(scope="session")
def nebula_db():
    """Create and return a connection to the test database with schema applied."""
    dsn = _load_dsn()
    cfg = _parse_dsn(dsn)
    host, port, user, password = _ensure_test_db()
    dbname = cfg.get("dbname", TEST_DB)

    _apply_schema(dbname)

    conn = psycopg2.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        dbname=dbname,
    )
    conn.set_session(autocommit=True)
    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def clean_schema(nebula_db):
    """Clean all tables before each test, preserving sequences."""
    cur = nebula_db.cursor()
    cur.execute("SET search_path TO nebula")
    cur.execute("""
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'nebula' AND tablename != 'color_palette'
    """)
    tables = [row[0] for row in cur.fetchall()]
    for t in tables:
        cur.execute(f"TRUNCATE TABLE {t} RESTART IDENTITY CASCADE")
    cur.close()


@pytest.fixture
def db(nebula_db):
    """Returns a cursor wrapper for test queries."""
    class CursorWrapper:
        def __init__(self, conn):
            self.conn = conn
            self._cur = None

        def __enter__(self):
            self._cur = self.conn.cursor(cursor_factory=RealDictCursor)
            self._cur.execute("SET search_path TO nebula")
            return self._cur

        def __exit__(self, *args):
            if self._cur:
                self._cur.close()

    return CursorWrapper(nebula_db)


@pytest.fixture
def sample_system(db):
    """Create and return a sample system."""
    with db as cur:
        cur.execute(
            "INSERT INTO systems (name, description, color) VALUES (%s, %s, %s) RETURNING *",
            ("Test System", "A test system", "#3b82f6"),
        )
        return cur.fetchone()
