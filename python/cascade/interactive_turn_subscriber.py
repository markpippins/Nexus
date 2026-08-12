"""interactive_turn_subscriber.py — Listens for assembly.comment.created, executes turns.

Subscribes to ``nexus.duality.v1.conversation.>`` via NATS and manages
interactive conversation turns for Duality / Plurality sessions.

For each ``assembly.comment.created`` event it:

1. Checks duality.session_watches: is this thread managed?
2. Finds the target role (the role that should REPLY, not the one who posted)
3. Applies conversation_coordinator doctrine to decide: continue, delegate, close
4. If continue: invokes the agent (opencode via harness-srv or Freebuff path)
5. Posts the agent's response as an Assembly comment
6. Consumes one unit from the role lease
7. Emits governance receipt

Architecture — execution_backend dispatch::

    assembly.comment.created event
        └─→ watch.execution_backend?
                ├─→ 'operator'  → operator service POST /chat (FreeBuff persistent session,
                │                  incremental context — session already owns conversation)
                ├─→ 'harness'   → harness-srv POST /run-direct (OpenCode ephemeral execution,
                │                  full context reconstruction from Assembly + identities)
                └─→ 'freebuff'  → emit conversation.turn.requested on NATS
                                   (direct interactive, session already has context)

Usage::

    DATABASE_URL=postgres://pguser:pgpass@localhost:5432/nexus \\
        NATS_URL=nats://localhost:4222 \\
        HARNESS_SRV_URL=http://localhost:3420 \\
        python3 interactive_turn_subscriber.py
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import select
import signal
import sys
import time
import urllib.request
from typing import Any

# ── Path setup ──────────────────────────────────────────────────────
try:
    _PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
except NameError:
    _PARENT = os.path.dirname(os.path.dirname(os.path.abspath('.')))
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)

from cascade.conversation_coordinator import (
    resolve_conversation_outcome,
    is_terminal,
    OUTCOME_CONTINUE,
    OUTCOME_DELEGATE,
)

# ── Configuration ───────────────────────────────────────────────────
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgres://pguser:pgpass@localhost:5432/nexus",
)
NATS_URL = os.getenv("NATS_URL", "nats://localhost:4222")
NATS_SUBJECT = os.getenv(
    "INTERACTIVE_NATS_SUBJECT",
    "nexus.duality.v1.conversation.>",
)

HARNESS_SRV_URL = os.getenv("HARNESS_SRV_URL", "http://localhost:3420")
ASSEMBLY_URL = os.getenv("ASSEMBLY_URL", "http://localhost:3107")
NEBULA_URL = os.getenv("NEBULA_URL", "http://localhost:3101")
FORUM_SLUG = os.getenv("DUALITY_FORUM_SLUG", "duality-sessions")

# ── Logging ─────────────────────────────────────────────────────────

def _log(msg: str, *args: Any) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    print(f"[{ts}] [interactive-turn] {msg % args}", flush=True)


# ── Signal handling ─────────────────────────────────────────────────

_shutdown = asyncio.Event()
_seen: set[str] = set()
_SEEN_CAP = 10_000


def _remember(event_id: str) -> None:
    if event_id not in _seen and len(_seen) >= _SEEN_CAP:
        _seen.pop()
    _seen.add(event_id)


def _signal_handler() -> None:
    _log("Shutdown signal received — draining...")
    _shutdown.set()


# ═══════════════════════════════════════════════════════════════════════
#  Database helpers
# ═══════════════════════════════════════════════════════════════════════

def _query_watches(pg_conn: Any, thread_id: str) -> list[dict[str, Any]]:
    """Return all active watch rows for a thread."""
    with pg_conn.cursor() as cur:
        cur.execute(
            """SELECT id, thread_id, forum_slug, role, lease_id,
                      max_turns, turn_count, idle_timeout_ms,
                      last_activity, status, execution_backend
               FROM duality.session_watches
               WHERE thread_id = %s::uuid AND status = 'active'
               ORDER BY role""",
            (thread_id,),
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def _query_lease(pg_conn: Any, lease_id: str) -> dict[str, Any] | None:
    """Return the active lease row, or None."""
    if not lease_id:
        return None
    with pg_conn.cursor() as cur:
        cur.execute(
            """SELECT id, role, channel, model,
                      budget_units, consumed_units,
                      status, window_end, expires_at
               FROM tackle.role_leases
               WHERE id = %s::uuid AND status = 'ACTIVE'""",
            (lease_id,),
        )
        cols = [d[0] for d in cur.description]
        row = cur.fetchone()
        return dict(zip(cols, row)) if row else None


def _query_active_lease_for_role(pg_conn: Any, role: str) -> dict[str, Any] | None:
    """Return the most recent ACTIVE role lease for a role, or None.

    Fallback when a watch has no lease_id (every watch created through the
    assembly-srv POST /api/duality/watches API, which does not set the
    column). One ACTIVE lease per role is enforced at issue time (409), so
    this lookup is deterministic. Without a resolved lease the coordinator
    closes the watch after one turn (R1: no active lease) and the harness
    falls back to the config_bundle default model.
    """
    with pg_conn.cursor() as cur:
        cur.execute(
            """SELECT id, role, channel, model,
                      budget_units, consumed_units,
                      status, window_end, expires_at
               FROM tackle.role_leases
               WHERE role = %s AND status = 'ACTIVE'
               ORDER BY created_at DESC
               LIMIT 1""",
            (role,),
        )
        cols = [d[0] for d in cur.description]
        row = cur.fetchone()
        return dict(zip(cols, row)) if row else None


def _bump_turn_count(pg_conn: Any, watch_id: str) -> None:
    """Increment turn_count and update last_activity."""
    with pg_conn.cursor() as cur:
        cur.execute(
            """UPDATE duality.session_watches
               SET turn_count = turn_count + 1,
                   last_activity = now(),
                   updated_at = now()
               WHERE id = %s::uuid""",
            (watch_id,),
        )
    pg_conn.commit()


def _close_watch(pg_conn: Any, watch_id: str, reason: str) -> None:
    """Mark a watch as closed."""
    with pg_conn.cursor() as cur:
        cur.execute(
            """UPDATE duality.session_watches
               SET status = 'closed',
                   updated_at = now()
               WHERE id = %s::uuid""",
            (watch_id,),
        )
    pg_conn.commit()
    _log("Watch %s closed: %s", watch_id[:8], reason)


def _consume_lease(role: str) -> None:
    """POST /api/role-leases/consume on nebula (best-effort)."""
    try:
        body = json.dumps({"role": role}).encode()
        req = urllib.request.Request(
            f"{NEBULA_URL}/api/role-leases/consume",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            _log("Lease consumed for %s: consumed=%s", role,
                 data.get("consumed", data.get("consumed_units", "?")))
    except Exception as e:
        _log("Lease consume failed for %s: %s", role, e)


# ═══════════════════════════════════════════════════════════════════════
#  Agent invocation
# ═══════════════════════════════════════════════════════════════════════

OPERATOR_SVC_URL = os.getenv("OPERATOR_SVC_URL", "http://localhost:3018")


def _invoke_agent_operator(
    role: str,
    prompt: str,
    model: str | None,
    timeout_ms: int = 300_000,
) -> dict[str, Any]:
    """Invoke an agent via the operator service POST /chat.

    This is the FreeBuff path — the operator service maintains a
    persistent provider session. We only pass the new interaction
    (not the full thread history), since the session already has
    the conversation context.

    Returns { exit_code, stdout, stderr } matching harness-srv shape.
    """
    body = json.dumps({
        "role": role,
        "message": prompt,
        "session_id": None,  # stateless turn-by-turn
        "log_level": "ERROR",
    }).encode()

    req = urllib.request.Request(
        f"{OPERATOR_SVC_URL}/chat",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_ms // 1000 + 30) as resp:
            data = json.loads(resp.read())
            response_text = data.get("response", "") or ""
            if data.get("error"):
                return {"exit_code": 1, "stdout": "", "stderr": data["error"]}
            return {"exit_code": 0, "stdout": response_text, "stderr": ""}
    except Exception as e:
        _log("Operator invocation failed for %s: %s", role, e)
        return {"exit_code": 1, "stdout": "", "stderr": str(e)}


def _extract_opencode_text(stdout: str) -> str:
    """Extract assistant text from an opencode `--format json` event stream.

    opencode emits JSON-lines events (step_start / text / reasoning / ...);
    posting the raw envelope as a conversation response is unreadable. This
    collects every `{"type":"text","part":{"text":...}}` payload and joins
    them.

    The whole stream is scanned rather than gating on the first character:
    opencode may emit a leading non-JSON banner/notice line, and the earlier
    gate (`stdout.lstrip().startswith("{")`) made extraction bail out and
    post the raw event envelopes to the session thread. If the stream is not
    JSON at all it is returned unchanged; if it is a JSON stream but the
    agent produced no text events (e.g. a tool-only turn), a readable marker
    is returned instead of raw envelopes.
    """
    if not stdout:
        return stdout
    texts: list[str] = []
    json_events = 0
    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        json_events += 1
        if ev.get("type") == "text":
            part = ev.get("part") or {}
            t = part.get("text")
            if isinstance(t, str) and t.strip():
                texts.append(t)
    if json_events:
        return "\n".join(texts) if texts else "(agent produced no text output this turn)"
    return stdout


def _invoke_agent_harness(
    role: str,
    prompt: str,
    model: str | None,
    timeout_ms: int = 300_000,
) -> dict[str, Any]:
    """Invoke an agent via harness-srv POST /run-direct.

    This is the OpenCode path — ephemeral execution that needs full
    context reconstruction. The prompt should already contain the
    assembled Assembly thread + participant identities + SOL facts.

    Returns { exit_code, stdout, stderr }.
    """
    body = json.dumps({
        "role": role,
        "prompt": prompt,
        **({"model": model} if model else {}),
        "timeout_ms": timeout_ms,
        "channel": "duality",
    }).encode()

    req = urllib.request.Request(
        f"{HARNESS_SRV_URL}/run-direct",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_ms // 1000 + 30) as resp:
            data = json.loads(resp.read())
            if data.get("error"):
                return {"exit_code": 1, "stdout": "", "stderr": data["error"]}
            return {
                "exit_code": data.get("exit_code", 0),
                # opencode --format json emits a JSON-lines event stream;
                # reduce it to the assistant's text so the conversation
                # response is readable rather than raw event envelopes.
                "stdout": _extract_opencode_text(data.get("stdout", "")),
                "stderr": data.get("stderr", ""),
            }
    except Exception as e:
        _log("Harness invocation failed for %s: %s", role, e)
        return {"exit_code": 1, "stdout": "", "stderr": str(e)}


async def _emit_turn_requested(
    nc: Any,
    thread_id: str,
    role: str,
    comment_role: str,
) -> bool:
    """Emit conversation.turn.requested on NATS for freebuff backends.

    The FreeBuff session already owns its context — we just need to
    signal that a new interaction is available. The session picks up
    the pointer and responds within its existing continuity.

    Subject: nexus.duality.v1.conversation.turn.requested
    Payload: { event_type, thread_id, role, comment_role, timestamp }

    Returns True if published successfully, False on failure.
    """
    try:
        payload = json.dumps({
            "event_type": "conversation.turn.requested",
            "thread_id": thread_id,
            "role": role,
            "comment_role": comment_role,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }).encode()
        await nc.publish("nexus.duality.v1.conversation.turn.requested", payload)
        _log("turn.requested published for %s (thread=%s, replied_by=%s)",
             role, thread_id[:8], comment_role)
        return True
    except Exception as e:
        _log("Failed to publish turn.requested for %s: %s", role, e)
        return False


def _post_assembly_comment(
    thread_id: str,
    body_text: str,
    role: str,
    model: str | None = None,
) -> str | None:
    """Post an agent response as an Assembly comment. Returns comment ID."""
    try:
        payload = {
            "body": body_text,
            "postedById": "af069ff6-760c-44cb-a0d4-11517164169b",  # engineer UUID
            "role": role,
            "model": model or "freebuff/deepseek-v4-flash",
        }
        data = json.dumps(payload).encode()
        req = urllib.request.Request(
            f"{ASSEMBLY_URL}/api/forums/threads/{thread_id}/comments",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
            return result.get("id")
    except Exception as e:
        _log("Failed to post Assembly comment: %s", e)
        return None


# ═══════════════════════════════════════════════════════════════════════
#  Thread context builders
# ═══════════════════════════════════════════════════════════════════════

def _build_thread_context(pg_conn: Any, thread_id: str, role: str) -> str:
    """Fetch recent thread comments and format as LLM prompt context.

    Used by the 'harness' backend — full reconstruction for ephemeral
    OpenCode execution that has no persistent conversational context.
    """
    with pg_conn.cursor() as cur:
        cur.execute(
            """SELECT c.role, c.text, c.created,
                      u.alias AS author
               FROM assembly.comments c
               LEFT JOIN assembly.users u ON u.id = c.posted_by_id
               WHERE c.post_id = %s::uuid
               ORDER BY c.created DESC
               LIMIT 30""",
            (thread_id,),
        )
        rows = cur.fetchall()

    if not rows:
        return f"You are the {role}. No prior conversation. Respond to the user's message."

    # Build in chronological order (oldest first)
    rows.reverse()
    lines = [f"You are the **{role}**. Here is the conversation so far:\n"]
    for r in rows:
        comment_role = r[0] or "user"
        author = r[2] or comment_role
        text = (r[1] or "")[:2000]  # truncate very long comments
        lines.append(f"**{author}** ({comment_role}): {text}\n")

    lines.append(f"\nAs the **{role}**, respond to the latest message above.")
    lines.append(
        "When you are done, include CONVERSATION_CLOSED if the topic is fully "
        "resolved, or DELEGATE <role>: <instruction> to hand off to another agent."
    )
    return "\n".join(lines)


def _build_incremental_context(
    pg_conn: Any,
    thread_id: str,
    role: str,
    comment_role: str,
) -> str:
    """Build minimal context for the operator (FreeBuff) backend.

    The operator service maintains a persistent provider session — it
    already owns the conversation history. We only pass the latest
    interaction, not the full thread reconstruction.
    """
    with pg_conn.cursor() as cur:
        cur.execute(
            """SELECT c.role, c.text, u.alias AS author
               FROM assembly.comments c
               LEFT JOIN assembly.users u ON u.id = c.posted_by_id
               WHERE c.post_id = %s::uuid
               ORDER BY c.created DESC
               LIMIT 1""",
            (thread_id,),
        )
        row = cur.fetchone()

    if row:
        author = row[2] or row[0] or "user"
        text = (row[1] or "")[:3000]
        return f"**{author}** ({row[0] or 'user'}): {text}\n\nAs the **{role}**, respond to this message."
    else:
        return f"You are the **{role}**. Respond to the user's message."


# ═══════════════════════════════════════════════════════════════════════
#  Event handling
# ═══════════════════════════════════════════════════════════════════════

def _normalize_comment_event(
    data: dict[str, Any],
) -> dict[str, Any] | None:
    """Normalize both kernel-transition and duality-conversation envelopes.

    Kernel transition path:
        pg_notify payload → _build_envelope → CanonicalEnvelope
        → NATS on nexus.kernel.v1.transition.assembly.comment.created
        Shape: { type, payload: { raw: { payload: { thread_id, role, forum_slug } } } }

    Duality conversation path:
        Direct NATS publish on nexus.duality.v1.conversation.assembly.comment.created
        Shape: { event_type, payload: { thread_id, role, forum_slug } }

    Returns normalized dict with { thread_id, comment_role, forum_slug } or None.
    """
    # ── Kernel transition envelope (deeply nested via _build_envelope) ──
    raw = data.get("payload", {}).get("raw", {})
    if raw and raw.get("event_type") == "assembly.comment.created":
        inner = raw.get("payload", {})
        if isinstance(inner, dict) and inner.get("thread_id"):
            return {
                "thread_id": inner["thread_id"],
                "comment_role": inner.get("role", ""),
                "forum_slug": inner.get("forum_slug", ""),
                "comment_id": inner.get("comment_id", ""),
            }

    # ── Duality conversation envelope (flat) ──
    payload = data.get("payload", {}) or {}
    inner = (
        payload.get("payload", payload)
        if isinstance(payload, dict) else payload
    )
    if isinstance(inner, dict) and inner.get("thread_id"):
        return {
            "thread_id": inner["thread_id"],
            "comment_role": inner.get("role", ""),
            "forum_slug": inner.get("forum_slug", ""),
            "comment_id": inner.get("comment_id", ""),
        }

    return None


async def handle_comment_created(
    nc: Any,
    pg_conn: Any,
    event_envelope: dict[str, Any],
) -> None:
    """Process an assembly.comment.created event.

    1. Dedup via _seen set (protects both PG LISTEN and NATS paths)
    2. Query watch table → find target roles
    3. For each watch: coordinator → continue/delegate/close
    4. If continue: invoke agent → post response → consume lease
    """
    # ── Dedup (protects both PG LISTEN and NATS paths) ──
    dedup_id = event_envelope.get("aggregate_id") or event_envelope.get("event_id", "")
    if dedup_id and dedup_id in _seen:
        return

    normalized = _normalize_comment_event(event_envelope)
    if not normalized:
        _log("Could not normalize comment event — skipping")
        return

    if dedup_id:
        _remember(dedup_id)

    thread_id = normalized["thread_id"]
    comment_role = normalized["comment_role"]
    forum_slug = normalized["forum_slug"]

    # ── Guard: never process system-level comments (error reports, etc).
    # These are posted by the subscriber itself when an agent fails;
    # re-processing them would create an infinite error loop.
    if comment_role == "system":
        return

    if not thread_id:
        _log("Missing thread_id in event — skipping")
        return

    # Only process duality-sessions forum threads
    if forum_slug and forum_slug != FORUM_SLUG:
        return

    _log("Processing comment on thread %s (forum=%s, role=%s)",
         thread_id[:8], forum_slug or "?", comment_role)

    # 1. Find active watches for this thread
    watches = _query_watches(pg_conn, thread_id)
    if not watches:
        return  # thread not managed

    for watch in watches:
        watch_role = watch["role"]
        watch_id = watch["id"]

        # Skip if the comment was posted BY the watch's own role
        # (don't reply to yourself)
        if comment_role and comment_role == watch_role:
            continue

        _log("Watch %s: role=%s turn=%s/%s",
             watch_id[:8], watch_role,
             watch.get("turn_count", 0), watch.get("max_turns", "?"))

        # 2. Check lease — watch.lease_id is the explicit binding, but the
        #    assembly-srv watch API doesn't set it; fall back to the role's
        #    most recent ACTIVE lease so the model + budget governance work.
        lease = _query_lease(pg_conn, watch.get("lease_id"))
        if lease is None:
            lease = _query_active_lease_for_role(pg_conn, watch_role)
            if lease:
                _log("Watch %s: no lease_id, resolved active lease %s for role %s",
                     watch_id[:8], str(lease["id"])[:8], watch_role)

        # ── Invoke the agent (backend dispatch) ──────────────────
        backend = watch.get("execution_backend", "operator")

        if backend == "freebuff":
            # FreeBuff session already owns context — emit pointer event.
            # The session polls Assembly directly (duality-ui polling loop).
            # We do NOT bump turn_count here — the session owns its own
            # accounting. Lease consumption also handled by the session.
            await _emit_turn_requested(nc, thread_id, watch_role, comment_role)
            continue

        # Build context appropriate for the backend
        if backend == "harness":
            # Full reconstruction for ephemeral OpenCode execution
            prompt = _build_thread_context(pg_conn, thread_id, watch_role)
        else:
            # operator: incremental — just the new comment, session has context
            prompt = _build_incremental_context(pg_conn, thread_id, watch_role, comment_role)

        _log("Invoking %s via %s backend...", watch_role, backend)
        if backend == "harness":
            result = _invoke_agent_harness(
                role=watch_role,
                prompt=prompt,
                model=lease.get("model") if lease else None,
            )
        else:
            result = _invoke_agent_operator(
                role=watch_role,
                prompt=prompt,
                model=lease.get("model") if lease else None,
            )

        stdout = result.get("stdout", "") or ""
        exit_code = result.get("exit_code", 1)

        if exit_code != 0:
            stderr = result.get("stderr", "") or ""
            _log("Agent %s failed (exit=%s): %s",
                 watch_role, exit_code, stderr[:200])
            _post_assembly_comment(
                thread_id,
                f"[system] Agent {watch_role} encountered an error: {stderr[:500]}",
                "system",
            )
            _bump_turn_count(pg_conn, watch_id)
            continue

        # 5. Post agent response
        response_preview = stdout[:3000]
        comment_id = _post_assembly_comment(
            thread_id, response_preview, watch_role,
            model=lease.get("model") if lease else None,
        )
        if comment_id:
            _log("Posted response as comment %s", comment_id[:8])

        # 6. Re-check coordinator with the actual response
        post_resolution = resolve_conversation_outcome(
            watch=watch,
            lease=lease,
            last_agent_response=stdout,
            now_ms=int(time.time() * 1000),
        )
        _log("Post-response coordinator: %s → %s (%s)",
             watch_role, post_resolution.outcome, post_resolution.reason)

        if is_terminal(post_resolution.outcome):
            _close_watch(pg_conn, watch_id, post_resolution.reason)
        else:
            _bump_turn_count(pg_conn, watch_id)

        # 7. Consume lease unit — the harness backend accounts for itself
        #    (harness-srv increments consumed_units on exit 0 via
        #    incrementConsumedUnits), so only the operator backend needs the
        #    subscriber-side consume. Without this guard each successful
        #    harness turn double-counts (2 units per turn).
        if backend != "harness":
            _consume_lease(watch_role)


# ═══════════════════════════════════════════════════════════════════════
#  NATS subscriber
# ═══════════════════════════════════════════════════════════════════════

def _is_comment_created(data: dict[str, Any], subject: str) -> bool:
    """True when this event is assembly.comment.created.

    Matches both kernel transition subjects
    (``nexus.kernel.v1.transition.assembly.comment.created``) and
    duality conversation subjects
    (``nexus.duality.v1.conversation.assembly.comment.created``).
    """
    if subject.endswith("assembly.comment.created"):
        return True
    return False


async def run_interactive_turn_subscriber() -> None:  # noqa: C901
    """Main loop: connect NATS + DB, subscribe, process comment events.

    Two event sources:
    1. PostgreSQL LISTEN on ``kernel_transition`` — receives trigger events
       directly from ``trg_comment_created`` (bypasses the NATS bridge).
       Channel: ``kernel_transition`` (same channel the trigger uses).
    2. NATS on ``nexus.duality.v1.conversation.>`` — future duality-specific
       events and turn.requested replies from freebuff sessions.
    """
    try:
        import psycopg2
        import psycopg2.extensions
    except ImportError as e:
        _log("FATAL: %s — install with: pip install psycopg2-binary", e)
        sys.exit(1)

    try:
        import nats
    except ImportError as e:
        _log("FATAL: %s — install with: pip install nats-py", e)
        sys.exit(1)

    # ── Connect to PostgreSQL ──
    _log("Connecting to PostgreSQL...")
    pg_conn = psycopg2.connect(DATABASE_URL)
    pg_conn.set_isolation_level(
        psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT
    )
    _log("PostgreSQL connected")

    # ── LISTEN for trigger events directly (bypass NATS bridge) ──
    _PG_LISTEN_CHANNEL = "kernel_transition"
    cur = pg_conn.cursor()
    cur.execute(f"LISTEN {_PG_LISTEN_CHANNEL};")
    _log("Listening on PostgreSQL channel '%s' for comment triggers",
         _PG_LISTEN_CHANNEL)

    # ── Connect to NATS (for duality conversation events + publishing) ──
    _log("Connecting to NATS at %s...", NATS_URL)
    nc = await nats.connect(NATS_URL, name="interactive_turn_subscriber")
    _log("NATS connected")

    processed_count = 0

    # ── NATS message handler (duality conversation events) ──
    async def on_nats_message(msg: Any) -> None:
        nonlocal processed_count

        try:
            data: dict[str, Any] = json.loads(msg.data.decode())
            _log("Received NATS event on %s", msg.subject)

            if not _is_comment_created(data, msg.subject):
                return

            await handle_comment_created(nc, pg_conn, data)
            processed_count += 1

        except json.JSONDecodeError as e:
            _log("Invalid JSON: %s", e)
        except Exception as e:
            _log("Error processing NATS message: %s", e)
            import traceback
            _log(traceback.format_exc())

    # ── Subscribe to NATS ──
    sub = await nc.subscribe(NATS_SUBJECT, cb=on_nats_message)
    _log("Subscribed to NATS %s", NATS_SUBJECT)
    _log("Forum: %s | Harness: %s", FORUM_SLUG, HARNESS_SRV_URL)

    # ── PG notification polling loop ──

    async def poll_pg_notifications() -> None:
        """Background task: poll PG for trigger notifications."""
        nonlocal processed_count
        while not _shutdown.is_set():
            try:
                ready = select.select([pg_conn], [], [], 0.5)
                if ready[0]:
                    pg_conn.poll()
                while pg_conn.notifies:
                    notify = pg_conn.notifies.pop(0)
                    if notify.channel != _PG_LISTEN_CHANNEL:
                        continue
                    try:
                        payload: dict[str, Any] = json.loads(notify.payload)
                        event_type = payload.get("event_type", "")
                        if event_type != "assembly.comment.created":
                            continue
                        _log("PG NOTIFY: %s (%s)",
                             event_type, payload.get("aggregate_id", "?")[:8])
                        # Wrap in the format handle_comment_created expects
                        await handle_comment_created(nc, pg_conn, payload)
                        processed_count += 1
                    except json.JSONDecodeError as e:
                        _log("Invalid PG payload: %s", e)
                    except Exception as e:
                        _log("Error processing PG notification: %s", e)
                        import traceback
                        _log(traceback.format_exc())
                await asyncio.sleep(0.1)
            except Exception as e:
                _log("PG poll error: %s", e)
                await asyncio.sleep(1)

    pg_task = asyncio.create_task(poll_pg_notifications())

    # ── Wait for shutdown ──
    try:
        await _shutdown.wait()
    except asyncio.CancelledError:
        pass
    finally:
        _log("Shutting down — %d events processed", processed_count)
        pg_task.cancel()
        try:
            await pg_task
        except asyncio.CancelledError:
            pass
        await sub.unsubscribe()
        await nc.drain()
        cur.close()
        pg_conn.close()
        _log("Connections closed")


# ── Entry point ─────────────────────────────────────────────────────

def main() -> None:
    """Entry point — installs signal handlers and runs the async loop."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, _signal_handler)
        except NotImplementedError:
            pass

    _log("Starting Interactive Turn Subscriber...")
    _log("NATS: %s | Subject: %s | Harness: %s",
         NATS_URL, NATS_SUBJECT, HARNESS_SRV_URL)
    try:
        loop.run_until_complete(run_interactive_turn_subscriber())
    except KeyboardInterrupt:
        _log("Interrupted")
    finally:
        loop.close()
        _log("Interactive Turn Subscriber stopped")


if __name__ == "__main__":
    main()
