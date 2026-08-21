"""turn_dispatcher.py — Polls for pending freebuff turns, invokes the agent,
posts the response to Assembly, and updates the turn state.

This is the missing piece in the freebuff pipeline:
  subscriber (detects comment) → bridge (turn.requested) → consumer (notification)
  → **turn_dispatcher (invokes agent)** → response posted to thread

Architecture:
  1. Poll duality.session_turns for state='accepted' AND execution_backend='freebuff'
  2. Build thread context from Assembly comments (same as harness path)
  3. Invoke agent via tackle.inference.call_llm (Tackle-resolved model)
  4. Post response to Assembly thread as the role's comment
  5. Update turn state to 'completed' or 'failed'
  6. Consume one lease unit
  7. Loop — check for more pending turns

Usage::

    DATABASE_URL=postgres://pguser:pgpass@localhost:5432/nexus \
        ASSEMBLY_URL=http://localhost:3107 \
        PYTHONPATH=/home/codex/dev/nexus/python \
        python3 turn_dispatcher.py

Systemd unit: ``~/.config/systemd/user/cascade-turn-dispatcher.service``
"""

from __future__ import annotations

import json
import os
import signal
import sys
import time
import urllib.error
import urllib.request
from typing import Any

# Tackle inference — role-resolved LLM calls with fallback chaining
try:
    from tackle.inference import call_llm as _call_llm
    from tackle.db import get_role_config
    _HAS_TACKLE = True
except ImportError:
    _HAS_TACKLE = False

# ── Configuration ───────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://pguser:pgpass@localhost:5432/nexus")
ASSEMBLY_URL = os.getenv("ASSEMBLY_URL", "http://localhost:3107")
POLL_INTERVAL_S = float(os.getenv("DISPATCH_POLL_INTERVAL_S", "2"))
DISPATCH_TIMEOUT_S = float(os.getenv("DISPATCH_TIMEOUT_S", "300"))  # 5 min per turn

# ── Logging ─────────────────────────────────────────────────────────

def _log(msg: str, *args: Any) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    print(f"[{ts}] [turn-dispatcher] {msg % args}", flush=True)


# ── Signal handling ─────────────────────────────────────────────────
_shutdown = False

def _signal_handler(_sig: int, _frame: Any) -> None:
    global _shutdown
    _log("Shutdown signal received — draining...")
    _shutdown = True


# ── Database helpers ────────────────────────────────────────────────

def _connect_db():
    """Connect to PostgreSQL (manual transaction management for FOR UPDATE SKIP LOCKED)."""
    try:
        import psycopg2
    except ImportError as e:
        _log("FATAL: %s — install with: pip install psycopg2-binary", e)
        sys.exit(1)

    conn = psycopg2.connect(DATABASE_URL, application_name="cascade-turn-dispatcher")
    return conn


def _claim_turn(pg_conn) -> dict[str, Any] | None:
    """Atomically claim one pending turn using SELECT FOR UPDATE SKIP LOCKED.

    Returns the claimed turn dict, or None if no turns are available.
    The row is locked and moved to 'running' state within a single
    transaction, preventing concurrent dispatchers fromdouble-processing.
    """
    with pg_conn.cursor() as cur:
        cur.execute(
            """SELECT t.id, t.thread_id, t.watch_id, t.role, t.execution_backend,
                      t.request_comment_id, t.execution_plan_version,
                      t.created_at
               FROM duality.session_turns t
               WHERE t.state = 'accepted'
                 AND t.execution_backend = 'freebuff'
               ORDER BY t.created_at ASC
               LIMIT 1
               FOR UPDATE SKIP LOCKED""",
        )
        row = cur.fetchone()
        if row is None:
            pg_conn.commit()
            return None

        cols = [d[0] for d in cur.description]
        turn = dict(zip(cols, row))

        # Claim: move to 'running' while we still hold the lock
        cur.execute(
            """UPDATE duality.session_turns
               SET state = 'running', updated_at = now()
               WHERE id = %s::uuid AND state = 'accepted'""",
            (turn["id"],),
        )
        pg_conn.commit()  # releases the lock

    _log("Turn %s claimed → running (role=%s)", str(turn["id"])[:8], turn["role"])
    return turn


def _update_turn_state(pg_conn, turn_id: str, state: str,
                       failure_detail: str | None = None,
                       response_comment_id: str | None = None) -> None:
    """Transition a turn to a new state (no commit — caller must commit)."""
    sets = ["state = %s", "updated_at = now()"]
    params: list[Any] = [state]
    if failure_detail is not None:
        sets.append("failure_detail = %s")
        params.append(failure_detail[:2000])
    if response_comment_id is not None:
        sets.append("response_comment_id = %s")
        params.append(response_comment_id)
    with pg_conn.cursor() as cur:
        cur.execute(
            f"""UPDATE duality.session_turns
                SET {', '.join(sets)}
                WHERE id = %s::uuid""",
            params + [turn_id],
        )
    _log("Turn %s → %s", str(turn_id)[:8], state)


def _touch_watch(pg_conn, watch_id: str) -> None:
    """Update watch last_activity timestamp."""
    with pg_conn.cursor() as cur:
        cur.execute(
            "UPDATE duality.session_watches SET last_activity = now(), updated_at = now() WHERE id = %s::uuid",
            (watch_id,),
        )


# ── Thread context builder ─────────────────────────────────────────

_PREAMBLE = (
    "You are the **{role}** role in an interactive Duality session.\n\n"
    "Session-start rituals DO NOT APPLY. Do NOT clock in or out, check your "
    "inbox or forum todos, verify services, or run boot checks.\n\n"
    "Answer the user's latest message directly. When done, include "
    "CONVERSATION_CLOSED if the topic is fully resolved, or "
    "DELEGATE <role>: <instruction> to hand off to another agent.\n"
)


def _build_thread_context(pg_conn, thread_id: str, role: str) -> str:
    """Fetch recent thread comments and format as prompt context."""
    with pg_conn.cursor() as cur:
        cur.execute(
            """SELECT c.role, c.text, c.created, u.alias AS author
               FROM assembly.comments c
               LEFT JOIN assembly.users u ON u.id = c.posted_by_id
               WHERE c.post_id = %s::uuid
                 AND (c.role IS NULL OR c.role <> 'thinking')
               ORDER BY c.created DESC
               LIMIT 5""",
            (thread_id,),
        )
        rows = cur.fetchall()

    if not rows:
        return _PREAMBLE.format(role=role) + f"You are the **{role}**. No prior conversation. Respond to the user's message."

    rows.reverse()
    lines = [f"You are the **{role}**. Here is the conversation so far:\n"]
    for r in rows:
        comment_role = r[0] or "user"
        author = r[3] or comment_role
        text = (r[1] or "")[:500]
        lines.append(f"**{author}** ({comment_role}): {text}\n")

    lines.append(f"\nAs the **{role}**, respond to the latest message above.")
    return _PREAMBLE.format(role=role) + "\n".join(lines)


# ── Agent invocation ────────────────────────────────────────────────

def _invoke_agent(prompt: str, role: str) -> dict[str, Any]:
    """Invoke the agent via Tackle-resolved model. Returns {stdout, exit_code}.

    Uses tackle.inference.call_llm which resolves the model config from
    tackle.config_bundle for the role, with automatic fallback chaining
    across providers (Nvidia → OpenRouter → OpenCode → Ollama → DeepSeek).
    """
    if not _HAS_TACKLE:
        return {"stdout": "", "exit_code": 1,
                "stderr": "tackle.inference not importable — check PYTHONPATH"}

    # Log which model Tackle resolved for this role
    cfg = get_role_config(role)
    if cfg:
        _log("Tackle resolved: provider=%s model=%s endpoint=%s",
             cfg.get("provider_type", "?"),
             cfg.get("model_identifier", "?"),
             cfg.get("endpoint_url", "?")[:60])
    else:
        _log("No Tackle config for role=%s — call_llm will try fallbacks", role)

    try:
        response = _call_llm(
            prompt,
            role=role,
            temperature=0.3,
            max_tokens=4096,
            fallback=True,
        )
        if response is None:
            return {"stdout": "", "exit_code": 1,
                    "stderr": "call_llm returned None — all models/fallbacks failed"}
        return {"stdout": response, "exit_code": 0}
    except Exception as e:
        return {"stdout": "", "exit_code": 1, "stderr": str(e)}


# ── Assembly posting ────────────────────────────────────────────────

def _post_assembly_comment(thread_id: str, body: str, role: str,
                           model: str | None = None) -> str | None:
    """Post a comment to the Assembly thread. Returns comment_id or None."""
    # Resolve the role's user UUID
    role_user_map = {
        "engineer": "af069ff6-760c-44cb-a0d4-11517164169b",
        "architect": "a71f75ba-1f53-46b2-9708-17269d1210b0",
        "analyst": "594d1982-8696-43c6-990a-9ac99e3faa32",
        "planner": "fd49d7c3-3e9c-4c82-8729-967fdef563e4",
        "reviewer": "bc5b0646-c2ee-4bf3-a40b-7b80085856bd",
        "inspector": "bf5f32f1-cbe2-424c-8552-e6571e8ce28f",
        "critic": "22f766a4-ccb5-441c-b1df-7506e9f1f5c9",
        "builder": "453bc5ce-c347-4f52-a68c-861f22e635cc",
    }
    posted_by_id = role_user_map.get(role, role_user_map.get("engineer"))

    payload = json.dumps({
        "body": body,
        "postedById": posted_by_id,
        "role": role,
        "model": model or "turn-dispatcher",
    }).encode()

    try:
        req = urllib.request.Request(
            f"{ASSEMBLY_URL}/api/forums/threads/{thread_id}/comments",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
            return result.get("id")
    except Exception as e:
        _log("Failed to post comment: %s", e)
        return None


# ── Lease consumption ───────────────────────────────────────────────

def _consume_lease(pg_conn, role: str) -> None:
    """Consume one unit from the role's active lease."""
    with pg_conn.cursor() as cur:
        cur.execute(
            """UPDATE tackle.role_leases
               SET consumed_units = consumed_units + 1, updated_at = now()
               WHERE role = %s AND channel = 'interactive' AND status = 'ACTIVE'
               RETURNING id, consumed_units, budget_units""",
            (role,),
        )
        row = cur.fetchone()
        if row:
            _log("Lease consumed: role=%s unit=%d/%d", role, row[1], row[2])
        else:
            _log("No active lease found for role=%s", role)


# ── Main dispatch loop ──────────────────────────────────────────────

def _dispatch_turn(pg_conn, turn: dict[str, Any]) -> bool:
    """Dispatch a single turn (already claimed as 'running' by _claim_turn).

    The row lock was released on commit in _claim_turn. This function does
    the expensive work (LLM call, Assembly post) outside any transaction,
    then starts a new transaction to persist the final state.
    """
    turn_id = str(turn["id"])
    thread_id = str(turn["thread_id"])
    watch_id = str(turn["watch_id"])
    role = turn["role"]

    _log("Dispatching turn %s (role=%s thread=%s)",
         turn_id[:8], role, thread_id[:8])

    # 1. Build thread context (needs a transaction for the SELECT)
    prompt = _build_thread_context(pg_conn, thread_id, role)
    _log("Prompt built: %d chars", len(prompt))

    # 2. Invoke agent via Tackle-resolved model (expensive, no lock held)
    result = _invoke_agent(prompt, role)
    stdout = result.get("stdout", "")
    exit_code = result.get("exit_code", 1)

    if exit_code != 0:
        stderr = result.get("stderr", "")
        _log("Agent failed (exit=%d): %s", exit_code, stderr[:200])
        _update_turn_state(pg_conn, turn_id, "failed",
                          failure_detail=stderr[:2000])
        _touch_watch(pg_conn, watch_id)
        pg_conn.commit()
        return False

    # 3. Post response to Assembly
    if not stdout.strip():
        stdout = "(no response)"

    # Tag the comment with the Tackle-resolved model for audit trail
    cfg = get_role_config(role) if _HAS_TACKLE else None
    model_tag = f"tackle/{cfg['model_identifier']}" if cfg else "turn-dispatcher"
    comment_id = _post_assembly_comment(thread_id, stdout, role, model_tag)
    if not comment_id:
        _log("Failed to post response — marking turn as failed")
        _update_turn_state(pg_conn, turn_id, "failed",
                          failure_detail="Failed to post Assembly comment")
        pg_conn.commit()
        return False

    # 4. Update turn state to 'completed'
    _update_turn_state(pg_conn, turn_id, "completed",
                      response_comment_id=comment_id)
    _touch_watch(pg_conn, watch_id)

    # 5. Consume lease unit
    _consume_lease(pg_conn, role)

    pg_conn.commit()  # persist all state changes atomically
    _log("Turn %s completed → comment %s", turn_id[:8], comment_id[:8])
    return True


def main() -> None:
    """Main polling loop."""
    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    _log("Starting Turn Dispatcher...")
    _log("DB: %s | Assembly: %s | Tackle: %s",
         DATABASE_URL.split("@")[-1], ASSEMBLY_URL,
         "available" if _HAS_TACKLE else "MISSING (check PYTHONPATH)")
    _log("Poll interval: %.1fs | Timeout: %.0fs", POLL_INTERVAL_S, DISPATCH_TIMEOUT_S)

    pg_conn = _connect_db()
    _log("PostgreSQL connected")

    total_dispatched = 0

    while not _shutdown:
        try:
            # Claim one turn at a time with FOR UPDATE SKIP LOCKED.
            # If none are available, we sleep and retry. Each claim is
            # atomic: the row is locked, moved to 'running', and committed
            # before the lock is released — no two dispatchers can claim
            # the same turn.
            turn = _claim_turn(pg_conn)
            if turn is None:
                time.sleep(POLL_INTERVAL_S)
                continue

            _dispatch_turn(pg_conn, turn)
            total_dispatched += 1

        except Exception as e:
            _log("Error in dispatch loop: %s", e)
            import traceback
            _log(traceback.format_exc())
            # Rollback any dangling transaction, then reconnect
            try:
                pg_conn.rollback()
            except Exception:
                pass
            try:
                pg_conn.close()
            except Exception:
                pass
            time.sleep(5)
            try:
                pg_conn = _connect_db()
                _log("PostgreSQL reconnected")
            except Exception as e2:
                _log("Reconnect failed: %s", e2)

        time.sleep(POLL_INTERVAL_S)

    _log("Shutting down — %d turns dispatched", total_dispatched)
    try:
        pg_conn.close()
    except Exception:
        pass


if __name__ == "__main__":
    main()
