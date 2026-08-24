"""
wr-conf-018: Duality failure-test matrix (P2 item 10).

Consolidates the Analyst's P2 item 10 acceptance criterion into guarded
conformance ACs:

    "Every failure appears within one bounded health/status interval and
     never creates an orphan session silently."

This suite fills the gaps NOT already covered by the earlier suites. The
full matrix and where each leg is guarded:

    1. right-role/backend changes   → duality-ui tests (role switch, backend
                                       switch) + /watches/active backend filter
    2. duplicate PG+NATS delivery   → AC1 here (durable dedup → one turn)
    3. browser reconnect (after N)  → wr-conf-015 (SSE after-cursor replay)
    4. watch POST 4xx/5xx           → AC2 here (validation, no orphan row)
    5. subscriber down              → duality-ui no-response timer + AC3's
                                       bounded-interval turn envelope
    6. stale Redis                  → wr-conf-017 (role-memory /health stale)
    7. harness timeout/cancel       → wr-conf-016 (async job + interrupt)
    8. provider failure             → AC3 here (turn.failed envelope)
    9. no-response diagnostics      → duality-ui surfaceTimeoutDiagnostics

Tested invariants (new here):
  AC1 — Durable dedup: re-delivering the SAME comment.created event (same
        event_key) produces exactly ONE turn — the UNIQUE event_key +
        ON CONFLICT DO NOTHING + subscriber _seen dedup collapse the
        duplicate, so no double-dispatch.
  AC2 — Watch validation: POST /api/duality/watches with missing required
        fields (or a malformed leaseId) returns 400 and creates NO watch row
        — a failed watch POST can never orphan a half-created session.
  AC3 — Provider failure surfaces: a harness turn whose role has no active
        config_bundle fails fast; the subscriber writes a `failed` turn
        envelope with failure_detail within one bounded interval (~30s) —
        the failure is visible, not a silent orphan/timeout.

Local-only (requires the interactive-turn subscriber daemon + assembly-srv +
harness-srv). CI skips.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_failure_matrix.py -v
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

import pytest

_skip_if_ci = pytest.mark.skipif(
    os.environ.get("CI") == "true",
    reason="wr-conf-018 requires live subscriber + assembly-srv + harness-srv (local only)",
)

_SELF_DIR = os.path.dirname(os.path.abspath(__file__))
_NEXUS_PYTHON = os.path.abspath(os.path.join(_SELF_DIR, "..", "..", ".."))
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

DSN = os.environ.get("CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus")
ASSEMBLY_URL = os.environ.get("ASSEMBLY_URL", "http://localhost:3107")
NEBULA_URL = os.environ.get("NEBULA_URL", "http://localhost:3101")
NATS_URL = os.environ.get("NATS_URL", "nats://localhost:4222")
FORUM_SLUG = "duality-sessions"

TEST_WATCH_ROLE = "architect"
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


# ── HTTP helpers ────────────────────────────────────────────────────

def _http_post(path: str, body: dict):
    req = urllib.request.Request(
        f"{ASSEMBLY_URL}{path}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8", "replace"))
        except Exception:
            return e.code, {"error": str(e)}


def _http_get(url: str):
    """GET an absolute URL, return (status, json)."""
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8", "replace"))
        except Exception:
            return e.code, {"error": str(e)}


# ── Fixture helpers ────────────────────────────────────────────────

def _setup_thread_and_watch(role: str = TEST_WATCH_ROLE, backend: str = "freebuff"):
    """Create a duality-sessions thread + session_watch row.

    Freebuff watches are bound to an existing ACTIVE interactive lease. The
    failure-matrix tests intentionally use a real authority row rather than
    relying on the subscriber's removed role-level fallback.
    Returns (thread_id, poster_id).
    """
    forum_id = str(_db_scalar(
        "SELECT id FROM assembly.forums WHERE slug = %s", (FORUM_SLUG,)
    ))
    assert forum_id, f"forum '{FORUM_SLUG}' must exist"

    poster_id = str(_db_scalar(
        "SELECT id FROM assembly.users WHERE alias = %s", (TEST_POSTER_ROLE,)
    ))

    thread_id = str(uuid.uuid4())
    _db_exec(
        "INSERT INTO assembly.posts (id, title, text, posted_by_id, forum_uuid, "
        "role, as_of_dt, expiration_dt) "
        "VALUES (%s::uuid, %s, %s, %s::uuid, %s::uuid, %s, now(), %s::timestamptz)",
        (thread_id, "wr-conf-018 test", "Conformance test thread.",
         poster_id, forum_id, TEST_POSTER_ROLE, "9999-12-31"),
    )
    lease_id = None
    if backend == "freebuff":
        lease_id = _db_scalar(
            "SELECT id FROM tackle.role_leases "
            "WHERE role = %s AND channel = 'interactive' AND status = 'ACTIVE' "
            "ORDER BY created_at DESC LIMIT 1", (role,)
        )
        if not lease_id:
            _db_exec("DELETE FROM assembly.posts WHERE id = %s::uuid", (thread_id,))
            pytest.skip(f"no active interactive lease available for {role}")
    _db_exec(
        "INSERT INTO duality.session_watches "
        "(thread_id, forum_slug, role, execution_backend, lease_id, max_turns) "
        "VALUES (%s::uuid, %s, %s, %s, %s::uuid, %s)",
        (thread_id, FORUM_SLUG, role, backend, lease_id, 20),
    )
    return thread_id, poster_id


def _teardown(thread_id: str) -> None:
    """Remove test data: events + turns + watch + comments + thread."""
    _db_exec("DELETE FROM duality.session_events WHERE thread_id = %s::uuid", (thread_id,))
    _db_exec("DELETE FROM duality.session_turns WHERE thread_id = %s::uuid", (thread_id,))
    _db_exec("DELETE FROM duality.session_watches WHERE thread_id = %s::uuid", (thread_id,))
    _db_exec("DELETE FROM assembly.comments WHERE post_id = %s::uuid", (thread_id,))
    _db_exec("DELETE FROM assembly.posts WHERE id = %s::uuid", (thread_id,))


def _insert_comment_event(thread_id: str, role: str, event_key: str) -> int:
    """Insert a comment.created envelope directly (fires the NOTIFY trigger).

    Returns the row's seq (0 when the ON CONFLICT DO NOTHING skipped it).
    """
    comment_id = str(uuid.uuid4())
    conn = _db()
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO duality.session_events
                 (thread_id, event_type, event_key, payload)
               VALUES (%s::uuid, 'comment.created', %s, %s::jsonb)
               ON CONFLICT (event_key) DO NOTHING
               RETURNING seq""",
            (thread_id, event_key,
             json.dumps({"comment_id": comment_id, "thread_id": thread_id, "role": role})),
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()
        return int(row[0]) if row else 0
    finally:
        conn.close()


def _poll_turn_state(thread_id: str, state: str, timeout_s: float = 30.0) -> dict | None:
    """Poll duality.session_turns until a row reaches `state` (or deadline)."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        rows = _db_rows(
            """SELECT state, failure_detail, execution_backend, role
               FROM duality.session_turns
               WHERE thread_id = %s::uuid
               ORDER BY created_at DESC
               LIMIT 1""",
            (thread_id,),
        )
        if rows and rows[0][0] == state:
            return {
                "state": rows[0][0],
                "failure_detail": rows[0][1],
                "execution_backend": rows[0][2],
                "role": rows[0][3],
            }
        time.sleep(0.5)
    # Return the last observed envelope (may be non-terminal) for diagnostics.
    rows = _db_rows(
        """SELECT state, failure_detail, execution_backend, role
           FROM duality.session_turns
           WHERE thread_id = %s::uuid
           ORDER BY created_at DESC
           LIMIT 1""",
        (thread_id,),
    )
    if rows:
        return {
            "state": rows[0][0],
            "failure_detail": rows[0][1],
            "execution_backend": rows[0][2],
            "role": rows[0][3],
        }
    return None


# ═══════════════════════════════════════════════════════════════════════
#  AC1 — Durable dedup: duplicate delivery produces exactly one turn
# ═══════════════════════════════════════════════════════════════════════

@_skip_if_ci
def test_01_duplicate_delivery_single_turn():
    thread_id, _poster = _setup_thread_and_watch(role=TEST_WATCH_ROLE, backend="freebuff")
    try:
        event_key = f"comment:{uuid.uuid4()}"

        # First delivery — inserts, NOTIFYs, dispatches a turn.
        seq1 = _insert_comment_event(thread_id, TEST_POSTER_ROLE, event_key)
        assert seq1 > 0, "first insert must produce a row"

        # Duplicate delivery of the SAME event — ON CONFLICT DO NOTHING.
        seq2 = _insert_comment_event(thread_id, TEST_POSTER_ROLE, event_key)
        assert seq2 == 0, "duplicate insert must be a no-op (event_key unique)"

        # Wait for the subscriber to process the single event.
        deadline = time.time() + 10
        while time.time() < deadline:
            count = _db_scalar(
                "SELECT count(*) FROM duality.session_turns WHERE thread_id = %s::uuid",
                (thread_id,),
            )
            if count and count >= 1:
                # Give the duplicate (if it were wrongly delivered) a moment
                # to materialize as a second turn before asserting.
                time.sleep(1.5)
                break
            time.sleep(0.3)

        count = _db_scalar(
            "SELECT count(*) FROM duality.session_turns WHERE thread_id = %s::uuid",
            (thread_id,),
        )
        assert count == 1, f"duplicate delivery must produce exactly 1 turn, got {count}"
    finally:
        _teardown(thread_id)


# ═══════════════════════════════════════════════════════════════════════
#  AC2 — Watch POST validation: 4xx and NO orphan watch row
# ═══════════════════════════════════════════════════════════════════════

@_skip_if_ci
def test_02_watch_post_missing_fields_400():
    thread_id, _poster = _setup_thread_and_watch()
    try:
        # Missing `role` (required).
        status, data = _http_post("/api/duality/watches", {
            "threadId": thread_id,
            "forumSlug": FORUM_SLUG,
        })
        assert status == 400, f"missing role must 400, got {status}: {data}"

        # Missing `threadId` (required).
        status, data = _http_post("/api/duality/watches", {
            "forumSlug": FORUM_SLUG,
            "role": TEST_WATCH_ROLE,
        })
        assert status == 400, f"missing threadId must 400, got {status}: {data}"

        # Malformed leaseId (must be a UUID) — must not silently accept it.
        status, data = _http_post("/api/duality/watches", {
            "threadId": thread_id,
            "forumSlug": FORUM_SLUG,
            "role": TEST_WATCH_ROLE,
            "leaseId": "not-a-uuid",
        })
        assert status == 400, f"malformed leaseId must 400, got {status}: {data}"
    finally:
        _teardown(thread_id)


@_skip_if_ci
def test_03_watch_post_4xx_creates_no_orphan_row():
    # A rejected watch POST must not leave a half-created watch behind.
    forum_id = str(_db_scalar(
        "SELECT id FROM assembly.forums WHERE slug = %s", (FORUM_SLUG,)
    ))
    poster_id = str(_db_scalar(
        "SELECT id FROM assembly.users WHERE alias = %s", (TEST_POSTER_ROLE,)
    ))
    thread_id = str(uuid.uuid4())
    _db_exec(
        "INSERT INTO assembly.posts (id, title, text, posted_by_id, forum_uuid, "
        "role, as_of_dt, expiration_dt) "
        "VALUES (%s::uuid, %s, %s, %s::uuid, %s::uuid, %s, now(), %s::timestamptz)",
        (thread_id, "wr-conf-018 orphan test", "no watch", poster_id, forum_id,
         TEST_POSTER_ROLE, "9999-12-31"),
    )
    try:
        status, _ = _http_post("/api/duality/watches", {
            "threadId": thread_id,
            "forumSlug": FORUM_SLUG,
            # role omitted on purpose → 400
        })
        assert status == 400, f"expected 400, got {status}"

        watch_count = _db_scalar(
            "SELECT count(*) FROM duality.session_watches WHERE thread_id = %s::uuid",
            (thread_id,),
        )
        assert watch_count == 0, \
            f"rejected watch POST must not create an orphan watch row, got {watch_count}"
    finally:
        _db_exec("DELETE FROM duality.session_watches WHERE thread_id = %s::uuid", (thread_id,))
        _db_exec("DELETE FROM assembly.comments WHERE post_id = %s::uuid", (thread_id,))
        _db_exec("DELETE FROM assembly.posts WHERE id = %s::uuid", (thread_id,))


# ═══════════════════════════════════════════════════════════════════════
#  AC3 — Provider failure surfaces as a failed turn envelope (bounded)
# ═══════════════════════════════════════════════════════════════════════

@_skip_if_ci
def test_04_provider_failure_produces_failed_turn():
    # A harness watch for a role with NO active config_bundle → harness-srv
    # /run-direct returns 400 ("No active config_bundle found for role X")
    # → the subscriber must write a `failed` turn envelope with failure_detail
    # within one bounded interval, instead of leaving an orphaned in-flight turn.
    role = f"wr-conf-018-fail-{uuid.uuid4().hex[:8]}"
    _db_exec(
        "INSERT INTO tackle.roles (id, name, description) VALUES (%s::uuid, %s, %s)",
        (str(uuid.uuid4()), role, "wr-conf-018 provider-failure test persona (no bundle)"),
    )
    thread_id, poster_id = _setup_thread_and_watch(role=role, backend="harness")
    try:
        status, data = _http_post(f"/api/duality/sessions/{thread_id}/messages", {
            "body": "Please respond.",
            "postedById": poster_id,
            "role": "user",
            "model": "freebuff/deepseek-v4-flash",
        })
        assert status == 201, f"messages POST must 201, got {status}: {data}"

        terminal = _poll_turn_state(thread_id, "failed", timeout_s=30.0)
        assert terminal is not None, "no turn envelope appeared — subscriber may be down"
        assert terminal["state"] == "failed", \
            f"expected failed turn envelope, got {terminal}"
        assert terminal["failure_detail"], \
            f"failure_detail must be present (failure visible, not silent): {terminal}"
    finally:
        _teardown(thread_id)
        _db_exec("DELETE FROM tackle.roles WHERE name = %s", (role,))


# ═══════════════════════════════════════════════════════════════════════
#  AC5 — Duplicate PG+NATS delivery collapses to one turn
# ═══════════════════════════════════════════════════════════════════════

def _publish_nats(subject: str, payload: dict) -> None:
    """Publish one message to NATS (synchronous wrapper around nats-py)."""
    import asyncio

    async def _pub() -> None:
        import nats
        nc = await nats.connect(NATS_URL)
        await nc.publish(subject, json.dumps(payload).encode())
        await nc.flush()
        await nc.close()

    asyncio.run(_pub())


@_skip_if_ci
def test_05_duplicate_pg_nats_delivery_single_turn():
    # P2 item 10: duplicate PG+NATS delivery must collapse to ONE turn. The
    # legacy NATS assembly.comment.created ingress was removed (single ingress
    # = duality_session_events), so publishing the old subject dispatches
    # nothing while the event stream dispatches once — no double-delivery.
    thread_id, _poster = _setup_thread_and_watch(role=TEST_WATCH_ROLE, backend="freebuff")
    try:
        # Legacy NATS ingress — must NOT dispatch (removed after P2 item 9).
        _publish_nats(
            "nexus.duality.v1.conversation.assembly.comment.created",
            {
                "event_type": "assembly.comment.created",
                "aggregate_id": str(uuid.uuid4()),
                "payload": {
                    "thread_id": thread_id,
                    "comment_id": str(uuid.uuid4()),
                    "forum_slug": FORUM_SLUG,
                    "role": TEST_POSTER_ROLE,
                },
            },
        )
        # Canonical event-stream ingress — dispatches once.
        _insert_comment_event(thread_id, TEST_POSTER_ROLE, f"comment:{uuid.uuid4()}")

        deadline = time.time() + 10
        while time.time() < deadline:
            count = _db_scalar(
                "SELECT count(*) FROM duality.session_turns WHERE thread_id = %s::uuid",
                (thread_id,),
            )
            if count and count >= 1:
                time.sleep(1.5)  # let any (wrong) duplicate materialize
                break
            time.sleep(0.3)

        count = _db_scalar(
            "SELECT count(*) FROM duality.session_turns WHERE thread_id = %s::uuid",
            (thread_id,),
        )
        assert count == 1, \
            f"PG event + NATS duplicate must produce exactly 1 turn, got {count}"
    finally:
        _teardown(thread_id)


# ═══════════════════════════════════════════════════════════════════════
#  AC6 — Watch POST malformed threadId → clean 400 (not raw 500)
# ═══════════════════════════════════════════════════════════════════════

@_skip_if_ci
def test_06_watch_post_malformed_threadid_400_not_500():
    # A malformed (non-UUID) threadId must be rejected with a clean 400 and a
    # surfaceable message — not a raw 500 from a PostgreSQL UUID cast error.
    status, data = _http_post("/api/duality/watches", {
        "threadId": "not-a-uuid",
        "forumSlug": FORUM_SLUG,
        "role": TEST_WATCH_ROLE,
    })
    assert status == 400, f"malformed threadId must 400 (not 500), got {status}: {data}"
    assert data.get("error"), f"400 must carry a surfaceable error body: {data}"
    assert "threadId" in str(data.get("error", "")), \
        f"error must name the offending field: {data}"


# ═══════════════════════════════════════════════════════════════════════
#  AC7 — Subscriber-down must be DETECTABLE (liveness probe)
# ═══════════════════════════════════════════════════════════════════════

@_skip_if_ci
def test_07_subscriber_liveness_probe_observable():
    # "Subscriber down" is not a silent state: the liveness probe
    # (nebula-srv /api/cascade/subscriber-status) reads pg_stat_activity for
    # the daemon's tagged connection, so the no-response diagnostics can tell
    # the user a response is impossible BEFORE they wait out the timer.
    status, data = _http_get(f"{NEBULA_URL}/api/cascade/subscriber-status")
    assert status == 200, f"subscriber-status must 200, got {status}: {data}"
    assert "up" in data, f"probe must expose `up`: {data}"
    # The subscriber daemon is running in this environment.
    assert data.get("up") is True, f"subscriber should be up: {data}"
    assert data.get("backendPid") is not None, \
        f"probe must expose backendPid: {data}"


# ═══════════════════════════════════════════════════════════════════════
#  AC8 — No-response diagnostics substrate is observable (bounded)
# ═══════════════════════════════════════════════════════════════════════

@_skip_if_ci
def test_08_no_response_diagnostics_substrate():
    # No-response diagnostics (duality-ui surfaceTimeoutDiagnostics) consume
    # the watch status + latest turn envelope. After a message is posted both
    # must be observable, so a stuck turn is DETECTABLE within the bounded
    # no-response interval — never a silent orphan.
    thread_id, poster_id = _setup_thread_and_watch(role=TEST_WATCH_ROLE, backend="freebuff")
    try:
        status, data = _http_post(f"/api/duality/sessions/{thread_id}/messages", {
            "body": "hello",
            "postedById": poster_id,
            "role": "user",
            "model": "freebuff/deepseek-v4-flash",
        })
        assert status == 201, f"messages POST must 201, got {status}: {data}"

        # Wait for the subscriber to create the turn envelope.
        deadline = time.time() + 10
        while time.time() < deadline:
            count = _db_scalar(
                "SELECT count(*) FROM duality.session_turns WHERE thread_id = %s::uuid",
                (thread_id,),
            )
            if count and count >= 1:
                break
            time.sleep(0.3)

        # 1. Latest turn envelope — the no-response timer reads this to tell
        #    "still running" vs "failed" and to compute the stuck interval.
        status, turns = _http_get(
            f"{ASSEMBLY_URL}/api/duality/turns/latest?threadId={thread_id}"
        )
        assert status == 200, f"turns/latest must 200, got {status}: {turns}"
        turn = turns.get("turn")
        assert turn is not None, f"turn envelope must be observable: {turns}"
        assert turn.get("state") in ("accepted", "running", "completed", "failed",
                                     "timed_out", "cancelled"), f"turn={turn}"
        assert turn.get("accepted_at") or turn.get("created_at"), \
            f"turn must carry a timestamp for the bounded-interval check: {turn}"

        # 2. Watch status — surfaceTimeoutDiagnostics reads this to report
        #    closed/paused/active (subscriber stuck) vs no-watch.
        status, watches = _http_get(f"{ASSEMBLY_URL}/api/duality/watches/{thread_id}")
        assert status == 200, f"watches must 200, got {status}: {watches}"
        assert any(w.get("role") == TEST_WATCH_ROLE for w in watches), \
            f"watch for {TEST_WATCH_ROLE} must be observable: {watches}"
    finally:
        _teardown(thread_id)


# ═══════════════════════════════════════════════════════════════════════
#  Module-level cleanup
# ═══════════════════════════════════════════════════════════════════════

def tearDownModule() -> None:
    """Purge any orphaned test rows (safety net)."""
    _db_exec(
        "DELETE FROM duality.session_events WHERE thread_id IN "
        "(SELECT id FROM assembly.posts WHERE title LIKE 'wr-conf-018%')"
    )
    _db_exec(
        "DELETE FROM duality.session_turns WHERE thread_id IN "
        "(SELECT id FROM assembly.posts WHERE title LIKE 'wr-conf-018%')"
    )
    _db_exec(
        "DELETE FROM duality.session_watches WHERE thread_id IN "
        "(SELECT id FROM assembly.posts WHERE title LIKE 'wr-conf-018%')"
    )
    _db_exec(
        "DELETE FROM assembly.comments WHERE post_id IN "
        "(SELECT id FROM assembly.posts WHERE title LIKE 'wr-conf-018%')"
    )
    _db_exec("DELETE FROM assembly.posts WHERE title LIKE 'wr-conf-018%'")
    _db_exec("DELETE FROM tackle.roles WHERE name LIKE 'wr-conf-018-fail-%'")


if __name__ == "__main__":
    import unittest
    unittest.main()
