"""
wr-conf-015: Duality session event log + replayable SSE stream (P1 items 4-5).

Guards the durable per-thread event stream that replaces count-based change
detection in duality-ui:

    subscriber / assembly-srv → INSERT duality.session_events (event_key dedup)
      → trg_session_events_notify → pg_notify('duality_session_events')
        → assembly-srv GET /api/duality/sessions/:id/events?after=<seq>
          → connected + replay + live typed envelopes + heartbeats

Tested invariants:
  AC0 — Schema: duality.session_events exists with the expected columns,
        event_type CHECK, UNIQUE event_key, (thread_id, seq) index, and the
        NOTIFY trigger.
  AC1 — Durable dedup: inserting the same event_key twice yields exactly one
        row (ON CONFLICT DO NOTHING).
  AC2 — NOTIFY trigger: LISTEN on duality_session_events receives a payload
        {thread_id, seq} when a row is inserted.
  AC3 — SSE endpoint live: connecting streams a `connected` envelope and
        live-pushes a row inserted after connect (requires assembly-srv).
  AC4 — Replay cursor: connecting with after=<seq> replays only newer events.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_session_events.py -v
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import unittest
import urllib.request
import uuid

import pytest

# ── CI guard: AC3/AC4 require the live assembly-srv (SSE server). ─────
# AC0-AC2 are DB-only and run everywhere (CI + local).
_skip_if_ci = pytest.mark.skipif(
    os.environ.get("CI") == "true",
    reason="wr-conf-015 SSE ACs require assembly-srv on :3107 (local only)",
)

# ── Path setup ──
_SELF_DIR = os.path.dirname(os.path.abspath(__file__))
_NEXUS_PYTHON = os.path.abspath(os.path.join(_SELF_DIR, "..", "..", ".."))
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

DSN = os.environ.get("CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus")
ASSEMBLY_URL = os.environ.get("ASSEMBLY_URL", "http://localhost:3107")

_NOTIFY_CHANNEL = "duality_session_events"


# ── DB helpers ──────────────────────────────────────────────────────

def _db():
    import psycopg2
    return psycopg2.connect(DSN)


def _db_exec(query: str, params=None) -> None:
    conn = _db()
    try:
        cur = conn.cursor()
        cur.execute(query, params) if params else cur.execute(query)
        conn.commit()
        cur.close()
    finally:
        conn.close()


def _db_rows(query: str, params=None) -> list:
    conn = _db()
    try:
        cur = conn.cursor()
        cur.execute(query, params) if params else cur.execute(query)
        rows = cur.fetchall()
        cur.close()
        return rows
    finally:
        conn.close()


def _db_scalar(query: str, params=None):
    rows = _db_rows(query, params)
    return rows[0][0] if rows else None


def _insert_event(thread_id: str, event_type: str, event_key: str,
                  payload: dict | None = None) -> None:
    # Idempotent write — mirrors the app contract (_record_session_event in
    # the subscriber, the watches route in assembly-srv): the UNIQUE event_key
    # is the durable dedup key, so a re-delivered event is a silent no-op.
    _db_exec(
        "INSERT INTO duality.session_events (thread_id, event_type, event_key, payload) "
        "VALUES (%s::uuid, %s, %s, %s::jsonb) "
        "ON CONFLICT (event_key) DO NOTHING",
        (thread_id, event_type, event_key, json.dumps(payload or {})),
    )


def _max_seq(thread_id: str) -> int:
    return int(_db_scalar(
        "SELECT COALESCE(MAX(seq), 0) FROM duality.session_events WHERE thread_id = %s::uuid",
        (thread_id,),
    ))


class _SseReader(threading.Thread):
    """Open an SSE connection and collect frames until stop() is called."""

    def __init__(self, url: str, max_frames: int = 50, timeout_s: float = 10.0):
        super().__init__(daemon=True)
        self._url = url
        self._max_frames = max_frames
        self._timeout_s = timeout_s
        self.frames: list[dict] = []  # {event, data}
        self._stop = threading.Event()

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        try:
            with urllib.request.urlopen(self._url, timeout=self._timeout_s) as resp:
                self.status = resp.status
                self.content_type = resp.headers.get("Content-Type")
                buf = b""
                while not self._stop.is_set() and len(self.frames) < self._max_frames:
                    chunk = resp.read(1)
                    if not chunk:
                        break
                    buf += chunk
                    if buf.endswith(b"\n\n"):
                        text = buf.decode()
                        buf = b""
                        event = ""
                        data = ""
                        for line in text.splitlines():
                            if line.startswith("event: "):
                                event = line[7:]
                            elif line.startswith("data: "):
                                data = line[6:]
                        if event:
                            try:
                                self.frames.append({"event": event, "data": json.loads(data)})
                            except json.JSONDecodeError:
                                self.frames.append({"event": event, "data": data})
        except Exception as e:  # pragma: no cover
            self.error = e


# ── AC0 — schema smoke (CI-safe) ────────────────────────────────────

class TestSessionEventsSchema(unittest.TestCase):
    """AC0 — duality.session_events shape, constraints, trigger."""

    def test_00_table_exists_with_columns(self):
        cols = _db_rows(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='duality' AND table_name='session_events'"
        )
        names = {r[0] for r in cols}
        for expected in ("seq", "thread_id", "turn_id", "watch_id",
                         "event_type", "event_key", "payload", "created_at"):
            self.assertIn(expected, names, f"missing column {expected}")

    def test_01_event_type_check(self):
        cons = _db_rows(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
            "WHERE conrelid = 'duality.session_events'::regclass "
            "AND contype = 'c'"
        )
        defs = " ".join(r[0] for r in cons)
        for t in ("turn.accepted", "turn.started", "thinking", "comment.created",
                  "turn.completed", "turn.failed", "turn.timed_out",
                  "turn.cancelled", "watch.status"):
            self.assertIn(t, defs, f"CHECK missing {t}")

    def test_02_event_key_unique(self):
        cons = _db_rows(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
            "WHERE conrelid = 'duality.session_events'::regclass "
            "AND contype = 'u'"
        )
        self.assertTrue(any("event_key" in r[0] for r in cons),
                        "expected UNIQUE constraint on event_key")

    def test_03_thread_seq_index(self):
        idx = _db_rows(
            "SELECT indexdef FROM pg_indexes "
            "WHERE schemaname='duality' AND tablename='session_events'"
        )
        defs = " ".join(r[0] for r in idx)
        self.assertIn("thread_id", defs)
        self.assertIn("seq", defs)

    def test_04_notify_trigger(self):
        trig = _db_rows(
            "SELECT tgname FROM pg_trigger "
            "WHERE tgrelid = 'duality.session_events'::regclass AND NOT tgisinternal"
        )
        self.assertTrue(any(r[0] == "trg_session_events_notify" for r in trig),
                        "expected trg_session_events_notify trigger")


# ── AC1/AC2 — durable dedup + NOTIFY (DB-only, CI-safe) ─────────────

class TestSessionEventsDedupAndNotify(unittest.TestCase):
    """AC1 — event_key idempotence; AC2 — NOTIFY trigger fires."""

    def test_10_durable_dedup(self):
        thread_id = str(uuid.uuid4())
        key = f"wr-conf-015:{uuid.uuid4()}"
        try:
            _insert_event(thread_id, "turn.accepted", key, {"role": "engineer"})
            _insert_event(thread_id, "turn.accepted", key, {"role": "engineer"})  # dup
            n = _db_scalar(
                "SELECT count(*) FROM duality.session_events WHERE event_key = %s",
                (key,),
            )
            self.assertEqual(n, 1, "duplicate event_key must collapse to one row")
        finally:
            _db_exec("DELETE FROM duality.session_events WHERE thread_id = %s::uuid",
                     (thread_id,))

    def test_11_notify_trigger_fires(self):
        import psycopg2
        conn = psycopg2.connect(DSN)
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        cur.execute(f"LISTEN {_NOTIFY_CHANNEL}")
        thread_id = str(uuid.uuid4())
        key = f"wr-conf-015-notify:{uuid.uuid4()}"
        try:
            _insert_event(thread_id, "comment.created", key, {"role": "engineer"})
            deadline = time.time() + 5
            payload = None
            while time.time() < deadline:
                cur.execute("SELECT 1")
                conn.poll()
                for notify in conn.notifies:
                    if notify.channel == _NOTIFY_CHANNEL:
                        payload = notify.payload
                if payload:
                    break
                time.sleep(0.1)
            self.assertIsNotNone(payload, "expected NOTIFY payload")
            data = json.loads(payload)
            self.assertEqual(data["thread_id"], thread_id)
            self.assertIsInstance(data["seq"], int)
        finally:
            conn.close()
            _db_exec("DELETE FROM duality.session_events WHERE thread_id = %s::uuid",
                     (thread_id,))


# ── AC3/AC4 — SSE endpoint (requires live assembly-srv) ─────────────

@_skip_if_ci
class TestSessionEventsSse(unittest.TestCase):
    """AC3 — live push; AC4 — replay cursor."""

    def test_20_live_push(self):
        thread_id = str(uuid.uuid4())
        reader = _SseReader(
            f"{ASSEMBLY_URL}/api/duality/sessions/{thread_id}/events",
            timeout_s=10,
        )
        try:
            reader.start()
            time.sleep(1.0)
            _insert_event(thread_id, "turn.accepted",
                          f"wr-conf-015:live:{uuid.uuid4()}", {"role": "engineer"})
            _insert_event(thread_id, "comment.created",
                          f"wr-conf-015:live:{uuid.uuid4()}", {"role": "engineer"})
            time.sleep(2.5)
            reader.stop()
            reader.join(timeout=5)
            self.assertEqual(reader.status, 200)
            self.assertIn("text/event-stream", reader.content_type or "")
            events = [f["event"] for f in reader.frames]
            self.assertIn("connected", events, f"frames={events}")
            self.assertIn("turn.accepted", events, f"frames={events}")
            self.assertIn("comment.created", events, f"frames={events}")
        finally:
            reader.stop()
            _db_exec("DELETE FROM duality.session_events WHERE thread_id = %s::uuid",
                     (thread_id,))

    def test_21_replay_cursor(self):
        thread_id = str(uuid.uuid4())
        try:
            _insert_event(thread_id, "turn.accepted",
                          f"wr-conf-015:replay1:{uuid.uuid4()}", {"role": "engineer"})
            _insert_event(thread_id, "turn.started",
                          f"wr-conf-015:replay2:{uuid.uuid4()}", {"role": "engineer"})
            first_seq = _max_seq(thread_id) - 1  # seq of the FIRST event
            reader = _SseReader(
                f"{ASSEMBLY_URL}/api/duality/sessions/{thread_id}/events?after={first_seq}",
                max_frames=3, timeout_s=8,
            )
            reader.start()
            time.sleep(2.0)
            reader.stop()
            reader.join(timeout=5)
            events = [f["event"] for f in reader.frames]
            self.assertIn("turn.started", events, f"frames={events}")
            self.assertNotIn("turn.accepted", events,
                             "replay with after=first_seq must not re-deliver the first event")
            connected = next(f for f in reader.frames if f["event"] == "connected")
            self.assertEqual(connected["data"]["replayed"], 1)
            self.assertEqual(connected["data"]["seq"], first_seq + 1)
        finally:
            reader.stop()
            _db_exec("DELETE FROM duality.session_events WHERE thread_id = %s::uuid",
                     (thread_id,))


if __name__ == "__main__":
    unittest.main()
