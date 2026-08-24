"""Shared configuration + DB access for the absorb package."""

from __future__ import annotations

import hashlib
import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras

DSN = os.environ.get("ABSORB_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus")
NEBULA_API = os.environ.get("NEBULA_API", "http://localhost:3101/api")
ASSEMBLY_API = os.environ.get("ASSEMBLY_API", "http://localhost:3107/api")

# Status vocabulary (mirrors assembly thread-status-ratings card)
STATUS = {0: "posted", 1: "specified", 2: "planned", 3: "implemented",
          4: "accepted", 5: "rejected", 6: "reopened", 7: "closed"}

# Sink-type default policies (used ONLY when a profile writes `policy: default`;
# the expansion is logged — spec C2 forbids silent defaults).
SINK_TYPE_DEFAULT_POLICY = {
    "pg.harvests":    {"on_failure": "fail_run",  "retry": {"max_attempts": 3, "backoff": "exponential"}, "timeout_seconds": 120},
    "mongo.mirror":   {"on_failure": "skip_sink", "retry": {"max_attempts": 1, "backoff": "fixed"},        "timeout_seconds": 30},
    "assembly.forum": {"on_failure": "skip_sink", "retry": {"max_attempts": 3, "backoff": "exponential"}, "timeout_seconds": 60},
}


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def fingerprint_path(path: str, mtime_ns: int, size: int) -> str:
    """Source watermark fingerprint (spec C3). NOTE (reviewer obs #1):
    mtime-fragile by design; store-level content-hash dedupe is the backstop."""
    return sha256_text(f"{path}|{mtime_ns}|{size}")


def source_rel_path(path: str, repo_root: Path) -> str:
    """Canonical source identity used for watermarks + provenance.
    MUST be the single helper both the CLI filter and the runner use,
    otherwise watermarks never match (regression fixed 2026-08-22)."""
    p = Path(path)
    try:
        return str(p.resolve().relative_to(Path(repo_root).resolve()))
    except ValueError:
        return str(p.resolve())


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


_CONN = None

def pg_conn():
    """Singleton connection (reconnects if broken). The CLI makes hundreds of
    small queries per run (per-file watermark checks etc.) — opening a fresh
    connection per query made runs crawl."""
    global _CONN
    if _CONN is not None:
        try:
            with _CONN.cursor() as cur:
                cur.execute("SELECT 1")
            return _CONN
        except Exception:
            try:
                _CONN.close()
            except Exception:
                pass
            _CONN = None
    _CONN = psycopg2.connect(DSN)
    return _CONN


@contextmanager
def pg():
    conn = pg_conn()
    try:
        yield conn
        try:
            conn.commit()
        except psycopg2.InterfaceError:
            _drop_conn()   # cleanup must never mask the original error path
    except Exception:
        try:
            conn.rollback()
        except Exception:
            _drop_conn()
        raise


def _drop_conn():
    global _CONN
    if _CONN is not None:
        try:
            _CONN.close()
        except Exception:
            pass
        _CONN = None


def _is_stale(err: Exception) -> bool:
    return isinstance(err, (psycopg2.InterfaceError, psycopg2.OperationalError))


def pg_fetchall(sql: str, params=()) -> list[dict]:
    """With one stale-connection retry: long-idle singletons get dropped by
    the server (or transit restarts); first touch then fails mid-query."""
    for attempt in (1, 2):
        try:
            with pg() as conn:
                cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                cur.execute(sql, params)
                return [dict(r) for r in cur.fetchall()]
        except (psycopg2.InterfaceError, psycopg2.OperationalError) as err:
            _drop_conn()
            if attempt == 2 or not _is_stale(err):
                raise


def pg_execute(sql: str, params=()) -> None:
    for attempt in (1, 2):
        try:
            with pg() as conn:
                conn.cursor().execute(sql, params)
                return
        except (psycopg2.InterfaceError, psycopg2.OperationalError) as err:
            _drop_conn()
            if attempt == 2 or not _is_stale(err):
                raise


def jdump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True)
