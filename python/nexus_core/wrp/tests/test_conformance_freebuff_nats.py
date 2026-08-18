"""
wr-conf-014: Freebuff NATS publish path — synthetic watch, event-first
message POST, NATS subscription asserting turn.requested is received.

This guards the full freebuff-turn bridge chain end-to-end (P2 item 9 —
the durable event stream is the dispatch source; Assembly comments are a
projection, not the transport):

    POST /api/duality/sessions/:id/messages
      → INSERT duality.session_events (comment.created)
        → trg_session_events_notify → pg_notify('duality_session_events')
          → interactive_turn_subscriber (PG LISTEN duality_session_events)
            → watch resolution (execution_backend=freebuff)
              → _emit_turn_requested → NATS publish
                → nexus.duality.v1.conversation.turn.requested

The interactive_turn_subscriber systemd daemon must be running for
this test to pass (it LISTENs on the PG channel and publishes to NATS),
and assembly-srv must serve the /messages endpoint.

Tested invariants:
  AC1 — Event delivery: a comment INSERT on a watched thread produces
        exactly one conversation.turn.requested event on NATS within 5s.
  AC2 — Payload correctness: the event payload contains the expected
        { event_type, thread_id, role, comment_role, timestamp } fields
        with correct values and valid types.
  AC3 — Self-reply guard: a comment posted BY the watch role does NOT
        produce a turn.requested event (the subscriber skips self-replies).
  AC4 — Unwatched threads: a comment on an unwatched thread does NOT
        produce a turn.requested event.
  AC5 — Dedup: two rapid comments on the same thread each produce one
        turn.requested event (no merging or dedup, since each comment
        is a distinct interaction).

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_freebuff_nats.py -v
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import threading
import time
import unittest
import urllib.request
import uuid

import pytest

# ── CI guard: integration ACs (1-5) require the interactive_turn_subscriber ──
# daemon running (PG LISTEN + NATS publish). GitHub Actions cannot provision
# the full cascade infrastructure (PostgreSQL schema, NATS, systemd daemon).
# The AC0 schema smoke tests run everywhere (CI + local).
#
# The skip is applied at the class level via _skip_if_ci; AC0 does not use it.

_skip_if_ci = pytest.mark.skipif(
    os.environ.get("CI") == "true",
    reason="wr-conf-014 integration ACs require interactive_turn_subscriber daemon + NATS (local only)",
)

# ── Path setup ──
_SELF_DIR = os.path.dirname(os.path.abspath(__file__))
_NEXUS_PYTHON = os.path.abspath(os.path.join(_SELF_DIR, "..", "..", ".."))
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

DSN = os.environ.get("CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus")
NATS_URL = os.environ.get("NATS_URL", "nats://localhost:4222")
FORUM_SLUG = "duality-sessions"
NATS_SUBJECT = "nexus.duality.v1.conversation.turn.requested"
ASSEMBLY_URL = os.environ.get("ASSEMBLY_URL", "http://localhost:3107")

TEST_ROLE = "architect"
TEST_POSTER_ROLE = "engineer"


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


# ── Test fixture helpers ────────────────────────────────────────────

def _setup_thread_and_watch(role: str = TEST_ROLE, backend: str = "freebuff"):
    """Create a duality-sessions thread + session_watch row.

    Returns (thread_id, engineer_id).
    """
    forum_id = str(_db_scalar(
        "SELECT id FROM assembly.forums WHERE slug = %s", (FORUM_SLUG,)
    ))
    assert forum_id, f"forum '{FORUM_SLUG}' must exist"

    eng_id = str(_db_scalar(
        "SELECT id FROM assembly.users WHERE alias = %s", (TEST_POSTER_ROLE,)
    ))

    thread_id = str(uuid.uuid4())
    _db_exec(
        "INSERT INTO assembly.posts (id, title, text, posted_by_id, forum_uuid, "
        "role, as_of_dt, expiration_dt) "
        "VALUES (%s::uuid, %s, %s, %s::uuid, %s::uuid, %s, now(), "
        "       %s::timestamptz)",
        (thread_id, "wr-conf-014 test", "Conformance test thread.",
         eng_id, forum_id, TEST_POSTER_ROLE, "9999-12-31"),
    )

    _db_exec(
        "INSERT INTO duality.session_watches "
        "(thread_id, forum_slug, role, execution_backend, max_turns) "
        "VALUES (%s::uuid, %s, %s, %s, %s)",
        (thread_id, FORUM_SLUG, role, backend, 20),
    )

    return thread_id, eng_id


def _post_comment(thread_id: str, role: str, text: str, poster_id: str) -> str:
    """Post a user message event-first via POST /api/duality/sessions/:id/messages.

    P2 item 9: the endpoint writes a comment.created envelope to the durable
    duality.session_events stream (source) and projects the Assembly comment
    (render) in one transaction. Returns the projected assembly comment id,
    or the event's canonical comment_id on projection failure.
    """
    req = urllib.request.Request(
        f"{ASSEMBLY_URL}/api/duality/sessions/{thread_id}/messages",
        data=json.dumps({
            "body": text,
            "postedById": poster_id,
            "role": role,
            "model": "freebuff/deepseek-v4-flash",
        }).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        result = json.loads(resp.read())
    return result.get("assembly_comment_id") or result.get("comment_id") or ""


def _teardown(thread_id: str) -> None:
    """Remove test data: events + turns + watch + comments + thread."""
    _db_exec("DELETE FROM duality.session_events WHERE thread_id = %s::uuid",
             (thread_id,))
    _db_exec("DELETE FROM duality.session_turns WHERE thread_id = %s::uuid",
             (thread_id,))
    _db_exec("DELETE FROM duality.session_watches WHERE thread_id = %s::uuid",
             (thread_id,))
    _db_exec("DELETE FROM assembly.comments WHERE post_id = %s::uuid",
             (thread_id,))
    _db_exec("DELETE FROM assembly.posts WHERE id = %s::uuid",
             (thread_id,))


# ── NATS subscriber (background thread) ─────────────────────────────

class _NatsListener:
    """Background NATS subscriber — start, then collect events later."""

    def __init__(self, timeout_s: float = 8.0):
        self._received: list[dict] = []
        self._timeout_s = timeout_s
        self._ready = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        """Launch the NATS subscription in a daemon thread.

        Blocks until the subscription is established (connected + subscribed).
        """
        received = self._received
        timeout_s = self._timeout_s
        ready = self._ready

        async def _listen() -> None:
            import nats
            nc = await nats.connect(NATS_URL)

            async def _on_msg(msg) -> None:
                data = json.loads(msg.data.decode())
                received.append(data)

            sub = await nc.subscribe(NATS_SUBJECT, cb=_on_msg)
            ready.set()  # signal: subscription is live
            await asyncio.sleep(timeout_s)
            await sub.unsubscribe()
            await nc.close()

        self._thread = threading.Thread(
            target=lambda: asyncio.run(_listen()), daemon=True,
        )
        self._thread.start()
        if not self._ready.wait(timeout=5.0):
            raise RuntimeError(
                "NATS subscription failed to establish within 5s — "
                "is NATS running at %s?" % NATS_URL
            )

    def collect(self) -> list[dict]:
        """Wait for the listener to finish and return all events received."""
        if self._thread is not None:
            self._thread.join(timeout=self._timeout_s + 3)
        return list(self._received)


# ═══════════════════════════════════════════════════════════════════════
#  AC1 — Event delivery: watched thread produces exactly one event
# ═══════════════════════════════════════════════════════════════════════

@_skip_if_ci
class TestAc1EventDelivery(unittest.TestCase):
    """A comment on a freebuff-watched thread produces a turn.requested event."""

    def test_comment_on_watched_thread_produces_event(self):
        thread_id, eng_id = _setup_thread_and_watch()
        try:
            listener = _NatsListener(timeout_s=6.0)
            listener.start()

            _post_comment(thread_id, TEST_POSTER_ROLE,
                          "Architect, please review this design proposal.",
                          eng_id)

            events = listener.collect()
            self.assertEqual(len(events), 1,
                             f"expected 1 turn.requested event, got {len(events)}")

            event = events[0]
            self.assertEqual(event.get("event_type"), "conversation.turn.requested")
            self.assertEqual(event.get("thread_id"), thread_id)
            self.assertEqual(event.get("role"), TEST_ROLE)
            self.assertEqual(event.get("comment_role"), TEST_POSTER_ROLE)
            self.assertIn("timestamp", event)
        finally:
            _teardown(thread_id)


# ═══════════════════════════════════════════════════════════════════════
#  AC2 — Payload correctness: all fields present and valid
# ═══════════════════════════════════════════════════════════════════════

@_skip_if_ci
class TestAc2PayloadCorrectness(unittest.TestCase):
    """The turn.requested payload has correct field types and values."""

    def test_payload_fields_are_valid(self):
        thread_id, eng_id = _setup_thread_and_watch()
        try:
            listener = _NatsListener(timeout_s=6.0)
            listener.start()

            _post_comment(thread_id, TEST_POSTER_ROLE,
                          "Review this spec please.", eng_id)

            events = listener.collect()
            self.assertEqual(len(events), 1)
            event = events[0]

            # event_type
            self.assertIsInstance(event["event_type"], str)
            self.assertEqual(event["event_type"], "conversation.turn.requested")

            # thread_id — must be a valid UUID string
            self.assertIsInstance(event["thread_id"], str)
            uuid.UUID(event["thread_id"])  # raises ValueError if invalid

            # role — the watch role that should respond
            self.assertIsInstance(event["role"], str)
            self.assertEqual(event["role"], TEST_ROLE)

            # comment_role — the role that posted the comment
            self.assertIsInstance(event["comment_role"], str)
            self.assertEqual(event["comment_role"], TEST_POSTER_ROLE)

            # timestamp — ISO 8601-ish
            self.assertIsInstance(event["timestamp"], str)
            self.assertIn("T", event["timestamp"])
            self.assertIn("Z", event["timestamp"])

            # No extra keys
            allowed_keys = {"event_type", "thread_id", "role",
                            "comment_role", "timestamp"}
            self.assertTrue(set(event.keys()).issubset(allowed_keys),
                            f"unexpected keys: {set(event.keys()) - allowed_keys}")
        finally:
            _teardown(thread_id)


# ═══════════════════════════════════════════════════════════════════════
#  AC3 — Self-reply guard: comment by watch role does NOT fire
# ═══════════════════════════════════════════════════════════════════════

@_skip_if_ci
class TestAc3SelfReplyGuard(unittest.TestCase):
    """A comment posted BY the watch role is not treated as a turn request."""

    def test_comment_by_watch_role_produces_no_event(self):
        thread_id, _eng_id = _setup_thread_and_watch()
        try:
            arch_id = str(_db_scalar(
                "SELECT id FROM assembly.users WHERE alias = %s", (TEST_ROLE,)
            ))
            self.assertTrue(arch_id, "architect user must exist")

            listener = _NatsListener(timeout_s=6.0)
            listener.start()

            _post_comment(thread_id, TEST_ROLE,
                          "I am the architect, replying to myself.",
                          arch_id)

            events = listener.collect()
            self.assertEqual(len(events), 0,
                             "self-reply (comment_role == watch_role) must not fire")
        finally:
            _teardown(thread_id)


# ═══════════════════════════════════════════════════════════════════════
#  AC4 — Unwatched threads: no watch → no event
# ═══════════════════════════════════════════════════════════════════════

@_skip_if_ci
class TestAc4UnwatchedThread(unittest.TestCase):
    """A comment on an unwatched thread does not produce a turn.requested event."""

    def test_comment_on_unwatched_thread_produces_no_event(self):
        forum_id = str(_db_scalar(
            "SELECT id FROM assembly.forums WHERE slug = %s", (FORUM_SLUG,)
        ))
        eng_id = str(_db_scalar(
            "SELECT id FROM assembly.users WHERE alias = %s", (TEST_POSTER_ROLE,)
        ))

        thread_id = str(uuid.uuid4())
        _db_exec(
            "INSERT INTO assembly.posts (id, title, text, posted_by_id, "
            "forum_uuid, role, as_of_dt, expiration_dt) "
            "VALUES (%s::uuid, %s, %s, %s::uuid, %s::uuid, %s, now(), "
            "       %s::timestamptz)",
            (thread_id, "unwatched test", "No watch on this thread.",
             eng_id, forum_id, TEST_POSTER_ROLE, "9999-12-31"),
        )

        try:
            listener = _NatsListener(timeout_s=6.0)
            listener.start()

            _post_comment(thread_id, TEST_POSTER_ROLE,
                          "Nobody is watching this thread.", eng_id)

            events = listener.collect()
            self.assertEqual(len(events), 0,
                             "unwatched thread must not produce turn.requested")
        finally:
            # No watch to clean, just the event + comments + thread
            _db_exec("DELETE FROM duality.session_events WHERE thread_id = %s::uuid",
                     (thread_id,))
            _db_exec("DELETE FROM assembly.comments WHERE post_id = %s::uuid",
                     (thread_id,))
            _db_exec("DELETE FROM assembly.posts WHERE id = %s::uuid",
                     (thread_id,))


# ═══════════════════════════════════════════════════════════════════════
#  AC5 — Two rapid comments each produce one event (no dedup-at-source)
# ═══════════════════════════════════════════════════════════════════════

@_skip_if_ci
class TestAc5TwoCommentsTwoEvents(unittest.TestCase):
    """Two distinct comments each produce their own turn.requested event."""

    def test_two_comments_produce_two_events(self):
        thread_id, eng_id = _setup_thread_and_watch()
        try:
            listener = _NatsListener(timeout_s=8.0)
            listener.start()

            _post_comment(thread_id, TEST_POSTER_ROLE,
                          "First question: what about the schema?", eng_id)
            time.sleep(1.5)
            _post_comment(thread_id, TEST_POSTER_ROLE,
                          "Second question: and the migration?", eng_id)

            events = listener.collect()
            self.assertEqual(len(events), 2,
                             f"expected 2 turn.requested events, got {len(events)}")
            for e in events:
                self.assertEqual(e["event_type"], "conversation.turn.requested")
                self.assertEqual(e["role"], TEST_ROLE)
                self.assertEqual(e["thread_id"], thread_id)
        finally:
            _teardown(thread_id)


# ═══════════════════════════════════════════════════════════════════════
#  AC0 — CI-safe schema smoke check (runs in CI, no daemon required)
# ═══════════════════════════════════════════════════════════════════════

class TestAc0SchemaSmoke(unittest.TestCase):
    """Schema invariants that CI can verify without the daemon.

    These tests run everywhere (including CI) because they only query
    PostgreSQL catalog tables — no NATS, no systemd daemon, no writes.
    """

    def test_duality_session_watches_table_exists(self):
        """The duality.session_watches table must exist with expected columns."""
        rows = _db_rows(
            "SELECT column_name, data_type "
            "FROM information_schema.columns "
            "WHERE table_schema = 'duality' AND table_name = 'session_watches' "
            "ORDER BY ordinal_position"
        )
        cols = {r[0] for r in rows}
        required = {
            "id", "thread_id", "forum_slug", "role", "execution_backend",
            "max_turns", "turn_count", "status",
        }
        missing = required - cols
        self.assertFalse(missing, f"session_watches missing columns: {missing}")

    def test_execution_backend_has_check_constraint(self):
        """The execution_backend column must have the CHECK constraint (V096)."""
        rows = _db_rows(
            "SELECT pg_get_constraintdef(oid) "
            "FROM pg_constraint "
            "WHERE conrelid = 'duality.session_watches'::regclass "
            "  AND conname LIKE '%execution%'"
        )
        self.assertTrue(rows, "execution_backend CHECK constraint must exist")
        constraint_def = rows[0][0] or ""
        for val in ("operator", "harness", "freebuff"):
            self.assertIn(val, constraint_def,
                          f"CHECK must include '{val}'")

    def test_trg_comment_created_exists(self):
        """The trg_comment_created trigger (V095) must exist on assembly.comments."""
        count = _db_scalar(
            "SELECT count(*) FROM pg_trigger "
            "WHERE tgname = 'trg_comment_created' "
            "  AND tgrelid = 'assembly.comments'::regclass"
        )
        self.assertEqual(count, 1, "trg_comment_created must exist")

    def test_duality_session_events_table_exists(self):
        """The duality.session_events table (V113) must exist with the
        dispatch-source columns (P2 item 9)."""
        rows = _db_rows(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'duality' AND table_name = 'session_events'"
        )
        cols = {r[0] for r in rows}
        required = {"seq", "thread_id", "event_type", "event_key", "payload"}
        missing = required - cols
        self.assertFalse(missing, f"session_events missing columns: {missing}")

    def test_trg_session_events_notify_exists(self):
        """The trg_session_events_notify trigger (V113) must exist — it fires
        the dispatch channel the subscriber LISTENs on (P2 item 9)."""
        count = _db_scalar(
            "SELECT count(*) FROM pg_trigger "
            "WHERE tgname = 'trg_session_events_notify' "
            "  AND tgrelid = 'duality.session_events'::regclass"
        )
        self.assertEqual(count, 1, "trg_session_events_notify must exist")

    def test_duality_sessions_forum_exists(self):
        """The duality-sessions forum must exist for watch registration."""
        forum_id = _db_scalar(
            "SELECT id FROM assembly.forums WHERE slug = 'duality-sessions'"
        )
        self.assertIsNotNone(forum_id, "duality-sessions forum must exist")

    def test_duality_session_turns_table_exists(self):
        """The duality.session_turns turn-envelope table (V112) must exist
        with the expected columns and state CHECK (P0-1 item 3)."""
        rows = _db_rows(
            "SELECT column_name, data_type "
            "FROM information_schema.columns "
            "WHERE table_schema = 'duality' AND table_name = 'session_turns' "
            "ORDER BY ordinal_position"
        )
        cols = {r[0] for r in rows}
        required = {
            "id", "thread_id", "watch_id", "role", "execution_backend",
            "state", "request_comment_id", "response_comment_id",
            "subscriber_id", "job_id", "execution_plan_version",
            "failure_detail", "accepted_at", "running_at", "completed_at",
            "failed_at", "timed_out_at", "cancelled_at",
        }
        missing = required - cols
        self.assertFalse(missing, f"session_turns missing columns: {missing}")

    def test_session_turns_state_check_constraint(self):
        """The state column must allow the full envelope vocabulary."""
        rows = _db_rows(
            "SELECT pg_get_constraintdef(oid) "
            "FROM pg_constraint "
            "WHERE conrelid = 'duality.session_turns'::regclass "
            "  AND conname LIKE '%state%'"
        )
        self.assertTrue(rows, "session_turns.state CHECK constraint must exist")
        constraint_def = rows[0][0] or ""
        for val in ("accepted", "running", "completed", "failed",
                    "timed_out", "cancelled"):
            self.assertIn(val, constraint_def,
                          f"CHECK must include '{val}'")


# ═══════════════════════════════════════════════════════════════════════
#  Module-level cleanup
# ═══════════════════════════════════════════════════════════════════════

def tearDownModule() -> None:
    """Purge any orphaned test rows (safety net)."""
    _db_exec(
        "DELETE FROM duality.session_events WHERE thread_id IN "
        "(SELECT id FROM assembly.posts WHERE title LIKE 'wr-conf-014%' "
        "  OR title = 'unwatched test')"
    )
    _db_exec(
        "DELETE FROM duality.session_turns WHERE thread_id IN "
        "(SELECT id FROM assembly.posts WHERE title LIKE 'wr-conf-014%' "
        "  OR title = 'unwatched test')"
    )
    _db_exec(
        "DELETE FROM duality.session_watches WHERE thread_id IN "
        "(SELECT id FROM assembly.posts WHERE title LIKE 'wr-conf-014%' "
        "  OR title = 'unwatched test')"
    )
    _db_exec(
        "DELETE FROM assembly.comments WHERE post_id IN "
        "(SELECT id FROM assembly.posts WHERE title LIKE 'wr-conf-014%' "
        "  OR title = 'unwatched test')"
    )
    _db_exec(
        "DELETE FROM assembly.posts WHERE title LIKE 'wr-conf-014%' "
        " OR title = 'unwatched test'"
    )


if __name__ == "__main__":
    unittest.main()
