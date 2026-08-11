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

Architecture::

    Duality-UI → POST /api/forums/.../comments
        └─→ assembly.comments INSERT
                └─→ trg_comment_created → pg_notify('kernel_transition', ...)
                        └─→ cascade/kernel_subscriber → NATS
                                └─→ nexus.duality.v1.conversation.assembly.comment.created
                                        └─→ interactive_turn_subscriber.py  (this daemon)
                                                ├─→ coordinator: continue/delegate/close?
                                                ├─→ harness-srv POST /run  (opencode agents)
                                                ├─→ Freebuff turn.requested event  (interactive agents)
                                                ├─→ POST assembly comment (response)
                                                └─→ POST /api/role-leases/consume

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
                      last_activity, status
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
                 data.get("consumed_units", "?"))
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

    The operator service (port 3018) is the same path nexus-console's
    MessageBoxService uses. It resolves role → config bundle → model
    and returns the LLM response. No wind task required.

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
#  Thread context builder
# ═══════════════════════════════════════════════════════════════════════

def _build_thread_context(pg_conn: Any, thread_id: str, role: str) -> str:
    """Fetch recent thread comments and format as LLM prompt context."""
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


# ═══════════════════════════════════════════════════════════════════════
#  Event handling
# ═══════════════════════════════════════════════════════════════════════

async def handle_comment_created(
    pg_conn: Any,
    event_envelope: dict[str, Any],
) -> None:
    """Process an assembly.comment.created event.

    1. Query watch table → find target roles
    2. For each watch: coordinator → continue/delegate/close
    3. If continue: invoke agent → post response → consume lease
    """
    payload = event_envelope.get("payload", {}) or {}
    inner = (
        payload.get("payload", payload)
        if isinstance(payload, dict) else payload
    )

    thread_id = inner.get("thread_id", "") if isinstance(inner, dict) else ""
    comment_role = inner.get("role", "") if isinstance(inner, dict) else ""
    forum_slug = inner.get("forum_slug", "") if isinstance(inner, dict) else ""

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

        # 2. Check lease
        lease = _query_lease(pg_conn, watch.get("lease_id"))

        # 3. Build context if we need it (for harness or context injection)
        context = _build_thread_context(pg_conn, thread_id, watch_role)

        # ── Invoke the agent ───────────────────────────────────────
        _log("Invoking %s via operator service...", watch_role)
        result = _invoke_agent_operator(
            role=watch_role,
            prompt=context,
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

        # 7. Consume lease unit
        _consume_lease(watch_role)


# ═══════════════════════════════════════════════════════════════════════
#  NATS subscriber
# ═══════════════════════════════════════════════════════════════════════

def _is_comment_created(data: dict[str, Any], subject: str) -> bool:
    """True when this event is assembly.comment.created."""
    if subject.endswith("assembly.comment.created"):
        return True
    return data.get("event_type") == "assembly.comment.created"


async def run_interactive_turn_subscriber() -> None:
    """Main loop: connect NATS + DB, subscribe, process comment events."""
    try:
        import psycopg2
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
    pg_conn.autocommit = True
    _log("PostgreSQL connected")

    # ── Connect to NATS ──
    _log("Connecting to NATS at %s...", NATS_URL)
    nc = await nats.connect(NATS_URL, name="interactive_turn_subscriber")
    _log("NATS connected")

    processed_count = 0

    # ── Message handler ──
    async def on_message(msg: Any) -> None:
        nonlocal processed_count

        try:
            data: dict[str, Any] = json.loads(msg.data.decode())
            event_id = str(data.get("event_id", ""))
            _log("Received event on %s (event_id=%s)", msg.subject, event_id[:8])

            if event_id and event_id in _seen:
                _log("Event %s already processed — skipping (dedup)", event_id[:8])
                return

            if not _is_comment_created(data, msg.subject):
                return

            await handle_comment_created(pg_conn, data)

            if event_id:
                _remember(event_id)
            processed_count += 1

        except json.JSONDecodeError as e:
            _log("Invalid JSON: %s", e)
        except Exception as e:
            _log("Error processing message: %s", e)
            import traceback
            _log(traceback.format_exc())

    # ── Subscribe ──
    sub = await nc.subscribe(NATS_SUBJECT, cb=on_message)
    _log("Subscribed to %s — waiting for comment events...", NATS_SUBJECT)
    _log("Forum: %s | Harness: %s", FORUM_SLUG, HARNESS_SRV_URL)

    # ── Wait for shutdown ──
    try:
        await _shutdown.wait()
    except asyncio.CancelledError:
        pass
    finally:
        _log("Shutting down — %d events processed", processed_count)
        await sub.unsubscribe()
        await nc.drain()
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
