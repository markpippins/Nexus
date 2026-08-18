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
import datetime
import json
import os
import re
import select
import signal
import sys
import time
import urllib.error
import urllib.request
import uuid
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


def _lease_valid(lease: dict[str, Any] | None) -> bool:
    """True when the lease is usable.

    Mirrors the coordinator's R1 lease governance (inverted). The role_leases
    queries already filter status='ACTIVE', so the checks here are the None
    case, budget exhaustion, and window expiry.
    """
    if lease is None:
        return False
    if lease.get("status") in ("EXPIRED", "RELEASED"):
        return False
    budget = lease.get("budget_units") or 0
    consumed = lease.get("consumed_units") or 0
    if budget > 0 and consumed >= budget:
        return False
    expires_at = lease.get("expires_at") or lease.get("window_end")
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.datetime.fromisoformat(
                expires_at.replace("Z", "+00:00")
            )
        if expires_at.timestamp() * 1000 < time.time() * 1000:
            return False
    return True


def _lease_failure_reason(lease: dict[str, Any] | None) -> str:
    """Exact R1 reason strings — identical to conversation_coordinator."""
    if lease is None:
        return "No active role lease"
    status = lease.get("status", "")
    if status in ("EXPIRED", "RELEASED"):
        return f"Role lease status={status}"
    budget = lease.get("budget_units") or 0
    consumed = lease.get("consumed_units") or 0
    remaining = max(0, budget - consumed)
    if budget > 0 and remaining <= 0:
        return f"Role lease exhausted ({consumed}/{budget} units consumed)"
    expires_at = lease.get("expires_at")
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.datetime.fromisoformat(
                expires_at.replace("Z", "+00:00")
            )
        if expires_at.timestamp() * 1000 < time.time() * 1000:
            return f"Role lease expired at {expires_at.isoformat()}"
    return "No active role lease"


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


def _touch_watch_activity(pg_conn: Any, watch_id: str) -> None:
    """Update last_activity only — used when a turn is NOT consumed.

    The leased-mode gate failure is not a turn: touching last_activity keeps
    the watch fresh for idle sweeps while leaving turn_count (and thus the
    max_turns budget) untouched.
    """
    with pg_conn.cursor() as cur:
        cur.execute(
            """UPDATE duality.session_watches
               SET last_activity = now(),
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
               WHERE id = %s::uuid
               RETURNING thread_id""",
            (watch_id,),
        )
        row = cur.fetchone()
    pg_conn.commit()
    _log("Watch %s closed: %s", watch_id[:8], reason)
    # Emit a durable watch.status envelope so SSE subscribers see the
    # session close (P1 item 4). Idempotent via event_key.
    if row:
        _record_session_event(
            pg_conn,
            thread_id=str(row[0]),
            watch_id=watch_id,
            event_type="watch.status",
            event_key=f"watch.closed:{watch_id}",
            payload={"status": "closed", "reason": reason[:500]},
        )


# ═══════════════════════════════════════════════════════════════════════
#  Session event log (P1 items 4-5)
# ═══════════════════════════════════════════════════════════════════════
# Durable, append-only per-thread stream in duality.session_events backing
# the replayable SSE endpoint GET /api/duality/sessions/:id/events?after=<seq>.
# Each row is a typed envelope with a monotonic sequence and a UNIQUE
# event_key — the durable dedup key. Writers INSERT ... ON CONFLICT DO
# NOTHING, so duplicate delivery (NATS + PG LISTEN ingresses, subscriber
# restart) cannot double-emit; the log is replayable history.

def _record_session_event(
    pg_conn: Any,
    thread_id: str,
    event_type: str,
    event_key: str,
    payload: dict[str, Any] | None = None,
    turn_id: str | None = None,
    watch_id: str | None = None,
) -> bool:
    """Append a typed envelope to duality.session_events (idempotent).

    event_key is the durable dedup key: a re-delivered event is a no-op via
    ON CONFLICT (event_key) DO NOTHING. Returns True when this call
    performed the insert, False when the event was already recorded (durable
    dedup hit). Never raises — event recording is best-effort so a log
    write failure cannot break turn execution (returns True on error so
    callers do not treat a failed log write as a duplicate).
    """
    try:
        with pg_conn.cursor() as cur:
            cur.execute(
                """INSERT INTO duality.session_events
                     (thread_id, turn_id, watch_id, event_type, event_key, payload)
                   VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s)
                   ON CONFLICT (event_key) DO NOTHING
                   RETURNING seq""",
                (thread_id, turn_id, watch_id, event_type, event_key,
                 json.dumps(payload or {})),
            )
            inserted = cur.fetchone() is not None
        pg_conn.commit()
        return inserted
    except Exception as e:
        _log("Failed to record session event %s: %s", event_key, e)
        return True


# ═══════════════════════════════════════════════════════════════════════
#  Turn/job state envelope (P0-1 item 3)
# ═══════════════════════════════════════════════════════════════════════
# One durable row per turn in duality.session_turns, keyed by turn_id,
# transitioning accepted → running → completed | failed | timed_out |
# cancelled. The UI renders this server-side state instead of inferring
# turn lifecycle from comment count. Rows are never deleted.

_TURN_STATE_COLUMNS = {
    "accepted": "accepted_at",
    "running": "running_at",
    "completed": "completed_at",
    "failed": "failed_at",
    "timed_out": "timed_out_at",
    "cancelled": "cancelled_at",
}


def _create_turn(
    pg_conn: Any,
    thread_id: str,
    watch_id: str,
    role: str,
    backend: str,
    request_comment_id: str | None,
    execution_plan_version: str | None = None,
) -> str:
    """Create a turn row in 'accepted' state. Returns turn_id."""
    with pg_conn.cursor() as cur:
        cur.execute(
            """INSERT INTO duality.session_turns
                 (thread_id, watch_id, role, execution_backend, state,
                  request_comment_id, subscriber_id, execution_plan_version,
                  accepted_at, created_at, updated_at)
               VALUES (%s::uuid, %s::uuid, %s, %s, 'accepted',
                       %s::uuid, 'cascade-interactive-turn', %s,
                       now(), now(), now())
               RETURNING id""",
            (thread_id, watch_id, role, backend,
             request_comment_id, execution_plan_version),
        )
        turn_id = cur.fetchone()[0]
    pg_conn.commit()
    _log("Turn %s created (thread=%s role=%s backend=%s state=accepted)",
         str(turn_id)[:8], str(thread_id)[:8], role, backend)
    # Emit the turn.accepted envelope (P1 item 4) — idempotent via event_key.
    _record_session_event(
        pg_conn,
        thread_id=thread_id,
        turn_id=str(turn_id),
        watch_id=watch_id,
        event_type="turn.accepted",
        event_key=f"turn.accepted:{turn_id}",
        payload={
            "role": role,
            "backend": backend,
            "request_comment_id": request_comment_id,
            "execution_plan_version": execution_plan_version,
        },
    )
    return str(turn_id)


def _set_turn_state(
    pg_conn: Any,
    turn_id: str,
    state: str,
    failure_detail: str | None = None,
    response_comment_id: str | None = None,
    job_id: str | None = None,
    execution_plan_version: str | None = None,
) -> None:
    """Transition a turn to a new state, stamping its *_at timestamp.

    Only forward transitions are applied (a completed turn is never
    rewritten to running): the state column is guarded so a stale event
    cannot regress an already-terminal turn.
    """
    from_column = _TURN_STATE_COLUMNS.get(state)
    if not from_column:
        _log("Turn %s: unknown state %r — ignoring", turn_id[:8], state)
        return
    sets = ["state = %s", f"{from_column} = now()", "updated_at = now()"]
    params: list[Any] = [state]
    if failure_detail is not None:
        sets.append("failure_detail = %s")
        params.append(failure_detail[:2000])
    if response_comment_id is not None:
        sets.append("response_comment_id = %s")
        params.append(response_comment_id)
    if job_id is not None:
        sets.append("job_id = %s")
        params.append(job_id)
    if execution_plan_version is not None:
        sets.append("execution_plan_version = %s")
        params.append(execution_plan_version)
    with pg_conn.cursor() as cur:
        cur.execute(
            f"""UPDATE duality.session_turns
               SET {', '.join(sets)}
               WHERE id = %s::uuid
                 AND state = ANY(ARRAY['accepted','running']::text[])
               RETURNING thread_id, role, execution_backend""",
            params + [turn_id],
        )
        row = cur.fetchone()
    pg_conn.commit()
    _log("Turn %s → %s", turn_id[:8], state)
    # Emit the matching typed envelope (P1 item 4): running → turn.started,
    # completed/failed/timed_out/cancelled → the terminal type. Idempotent
    # via event_key; skipped when the transition was rejected (already
    # terminal / unknown turn) or for 'accepted' (emitted at _create_turn).
    # Envelopes are self-describing: role + backend ride along so the SSE
    # consumer can render the envelope without an extra turn fetch.
    event_type = {
        "running": "turn.started",
        "completed": "turn.completed",
        "failed": "turn.failed",
        "timed_out": "turn.timed_out",
        "cancelled": "turn.cancelled",
    }.get(state)
    if row and event_type:
        payload: dict[str, Any] = {
            "role": row[1],
            "backend": row[2],
        }
        if failure_detail is not None:
            payload["failure_detail"] = failure_detail[:2000]
        if response_comment_id is not None:
            payload["response_comment_id"] = response_comment_id
        if job_id is not None:
            payload["job_id"] = job_id
        if execution_plan_version is not None:
            payload["execution_plan_version"] = execution_plan_version
        _record_session_event(
            pg_conn,
            thread_id=str(row[0]),
            turn_id=turn_id,
            event_type=event_type,
            event_key=f"turn.{state}:{turn_id}",
            payload=payload,
        )


def _consume_lease(role: str) -> None:
    """POST /api/role-leases/consume on nebula (best-effort)."""
    try:
        body = json.dumps({"role": role, "channel": "interactive"}).encode()
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
    except urllib.error.HTTPError as e:
        # Same as the harness path: surface the service's error body rather
        # than the generic 'HTTP Error N'.
        try:
            detail = (
                json.loads(e.read().decode("utf-8", "replace")).get("error")
                or str(e)
            )
        except Exception:
            detail = str(e)
        _log("Operator invocation failed for %s (HTTP %s): %s",
             role, e.code, str(detail))
        return {"exit_code": 1, "stdout": "", "stderr": str(detail)[:500]}
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


def _extract_opencode_trace(stdout: str) -> str:
    """Extract the agent's reasoning trace from an opencode `--format json`
    event stream.

    opencode emits `reasoning` events alongside `text` events (shape mirrors
    text: `{"type":"reasoning","part":{"text":...}}`; some versions put the
    text at the top level). The response extractor drops them — this collects
    them so the "agent thinking" trace can be surfaced in the UI the way
    Freebuff shows it. Returns joined reasoning text, or "" when the stream
    carries none (tool-only turns, non-JSON output, older agents).
    """
    if not stdout:
        return ""
    parts: list[str] = []
    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if ev.get("type") != "reasoning":
            continue
        part = ev.get("part") or {}
        t = part.get("text") if isinstance(part, dict) else None
        if not isinstance(t, str):
            t = ev.get("text")  # older envelope shape: top-level text
        if isinstance(t, str) and t.strip():
            parts.append(t)
    return "\n\n".join(parts)


def _compose_failure_detail(
    stderr: str, stdout: str, exit_code: int, job_id: str | None = None,
) -> str:
    """Build an actionable '[system] Agent … encountered an error:' detail.

    Never returns empty: falls back from stderr to the stdout tail to an
    explicit 'no-output' marker, and appends the harness job id when known.
    Without this, an exit-code failure with empty stderr posts a bare
    'encountered an error:' prefix and the user never sees why.
    """
    if stderr.strip():
        detail = stderr[:500]
        # harness-srv now reports timeouts honestly (exit 124 + marker in
        # stderr). The user wants the partial output the agent produced
        # before the wall — append the stdout tail when the marker is there.
        if "timeout after" in stderr.lower() and stdout.strip():
            detail = f"{detail}\nlast output: {stdout[-400:]}"
    elif stdout.strip():
        # stdout here is whatever the invoke function returned on failure —
        # it is normally already reduced to assistant text, but may be raw
        # opencode event envelopes if extraction bailed. Last-resort anyway.
        detail = f"(no stderr; exit {exit_code}) last output: {stdout[-400:]}"
    else:
        detail = f"exit code {exit_code} with no output"
    if job_id:
        detail = f"{detail} [job {job_id}]"
    return detail


def _invoke_agent_harness(
    role: str,
    prompt: str,
    model: str | None,
    timeout_ms: int = 600_000,
) -> dict[str, Any]:
    """Invoke an agent via harness-srv's async job contract (P1 item 6).

    POST /run-direct { async: true } returns 202 {job_id, state} and the
    job runs in the background; the subscriber polls GET /jobs/:jobId until
    terminal and reads the envelope — which preserves the RAW accumulated
    stdout (partial output on timeout/failure) and exact exit/timeout
    metadata. This replaces the old blocking-only contract: the subscriber
    no longer holds an HTTP connection open for the whole run.

    Returns { exit_code, stdout, stderr, trace, job_id }.
    """
    body = json.dumps({
        "role": role,
        "prompt": prompt,
        **({"model": model} if model else {}),
        "timeout_ms": timeout_ms,
        "channel": "duality",
        "async": True,
    }).encode()

    req = urllib.request.Request(
        f"{HARNESS_SRV_URL}/run-direct",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    def _result(data: dict[str, Any]) -> dict[str, Any]:
        raw = data.get("stdout", "") or ""
        plan = data.get("plan") or {}
        return {
            "exit_code": data.get("exit_code", 0),
            # opencode --format json emits a JSON-lines event stream;
            # reduce it to the assistant's text so the conversation
            # response is readable rather than raw event envelopes.
            "stdout": _extract_opencode_text(raw),
            # Keep the reasoning trace ("agent thinking") for the UI —
            # extracted from the RAW stream, not the reduced stdout.
            "trace": _extract_opencode_trace(raw),
            "stderr": data.get("stderr", ""),
            "job_id": data.get("job_id"),
            # P1 item 7 — the Tackle-resolved versioned execution plan.
            "plan_version": plan.get("plan_version"),
        }

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            accepted = json.loads(resp.read())
        job_id = accepted.get("job_id")
        if not job_id or resp.status != 202:
            if accepted.get("error"):
                return {
                    "exit_code": 1, "stdout": "", "stderr": accepted["error"],
                    "job_id": job_id,
                }
            return _result(accepted)  # sync-shaped response (older server)
    except urllib.error.HTTPError as e:
        # 4xx/5xx from harness-srv: urllib raises before reading the body,
        # so the real reason (e.g. 'No active config_bundle found for role X')
        # would be lost behind 'HTTP Error 400'. Read the JSON error field
        # and the job id so failures stay traceable in harness-srv logs.
        job_id = None
        try:
            err_data = json.loads(e.read().decode("utf-8", "replace"))
            detail = err_data.get("error") or str(e)
            job_id = err_data.get("job_id")
        except Exception:
            detail = str(e)
        _log("Harness invocation failed for %s (HTTP %s): %s",
             role, e.code, str(detail))
        return {
            "exit_code": 1, "stdout": "", "stderr": str(detail)[:500],
            "job_id": job_id,
        }
    except Exception as e:
        _log("Harness invocation failed for %s: %s", role, e)
        return {"exit_code": 1, "stdout": "", "stderr": str(e)}

    # ── Poll the job envelope until terminal (or the deadline) ──────
    deadline = time.time() + (timeout_ms / 1000) + 60  # 60s grace for start
    last_envelope: dict[str, Any] = {}
    terminal_states = {"completed", "failed", "timed_out", "cancelled"}
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(
                f"{HARNESS_SRV_URL}/jobs/{job_id}", timeout=30
            ) as resp:
                last_envelope = (json.loads(resp.read()) or {}).get("job", {})
        except Exception as e:
            _log("Job %s poll failed: %s", str(job_id)[:8], e)
            time.sleep(1.0)
            continue
        state = last_envelope.get("state", "")
        if state in terminal_states:
            if state == "cancelled":
                return {
                    "exit_code": 137,
                    "stdout": _extract_opencode_text(last_envelope.get("stdout", "") or ""),
                    "trace": _extract_opencode_trace(last_envelope.get("stdout", "") or ""),
                    "stderr": last_envelope.get("stderr") or "interrupted by user request",
                    "job_id": job_id,
                }
            return _result(last_envelope)
        time.sleep(1.0)

    # Deadline exceeded — the job never reached terminal. Report honestly
    # as a timeout (exit 124) and preserve the partial output produced so
    # far (P1 item 6: partial output + exact exit metadata).
    _log("Job %s did not finish within %sms — reporting timeout",
         str(job_id)[:8], timeout_ms)
    partial = last_envelope.get("stdout", "") or ""
    return {
        "exit_code": 124,
        "stdout": _extract_opencode_text(partial),
        "trace": _extract_opencode_trace(partial),
        "stderr": f"harness job {job_id} did not finish within {timeout_ms}ms — partial output below",
        "job_id": job_id,
    }


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
    pg_conn: Any,
    thread_id: str,
    body_text: str,
    role: str,
    model: str | None = None,
) -> str | None:
    """Project an agent response — event FIRST, then the Assembly comment.

    P2 item 9 (inversion): duality.session_events is the source of truth;
    the Assembly comment is a rendering projection. The typed envelope is
    written first (its NOTIFY pushes to SSE subscribers), then the comment
    is projected via the Assembly add_comment path, and the rendered comment
    id is linked back onto the event payload. Returns the ASSEMBLY comment
    id (so the turn envelope's response_comment_id resolves in the thread
    history), or None when the projection failed — the event survives either
    way.
    """
    event_type = "thinking" if role == "thinking" else "comment.created"
    canonical_id = str(uuid.uuid4())

    # 1. Event FIRST — the durable source of truth (append-only).
    _record_session_event(
        pg_conn=pg_conn,
        thread_id=thread_id,
        event_type=event_type,
        event_key=f"comment:{canonical_id}",
        payload={
            "comment_id": canonical_id,
            "role": role,
            "model": model,
            "excerpt": body_text[:200],
        },
    )

    # 2. Project the Assembly comment (render).
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
            comment_id = result.get("id")
    except Exception as e:
        _log("Failed to project Assembly comment (event preserved): %s", e)
        return None

    # 3. Link the rendered comment id back onto the event payload.
    if comment_id:
        try:
            with pg_conn.cursor() as cur:
                cur.execute(
                    """UPDATE duality.session_events
                       SET payload = payload || %s::jsonb
                       WHERE event_key = %s""",
                    (json.dumps({"assembly_comment_id": comment_id}),
                     f"comment:{canonical_id}"),
                )
            pg_conn.commit()
        except Exception as e:
            _log("Failed to link assembly_comment_id onto event: %s", e)
    return comment_id


# ═══════════════════════════════════════════════════════════════════════
#  Thread context builders
# ═══════════════════════════════════════════════════════════════════════

# One-shot execution frame for the harness backend. Prepended to every
# run-direct prompt: persona files / AGENTS.md bake in an interactive
# session-start ritual (clock-in, inbox check, service verification,
# pipeline-health scans, persona re-fetch) that eats the whole execution
# budget in an ephemeral single-turn run. An ephemeral run has no session
# to boot — say so explicitly so the agent answers instead of ritualizing.
_HARNESS_ONESHOT_PREAMBLE = (
    "You are a ONE-SHOT harnessed invocation of the **{role}** role — an "
    "ephemeral single-turn run with NO persistent session.\n\n"
    "Session-start rituals DO NOT APPLY. Do NOT clock in or out, check your "
    "inbox or forum todos, verify services, run boot or pipeline-health "
    "checks, or re-fetch personas. The harness sets HARNESS_ROLE and "
    "HARNESS_JOB_ID for identification only.\n\n"
    "Answer the user's latest message directly and stop when done.\n"
)

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
                 AND (c.role IS NULL OR c.role <> 'thinking')
               ORDER BY c.created DESC
               LIMIT 30""",
            (thread_id,),
        )
        rows = cur.fetchall()

    if not rows:
        return (
            _HARNESS_ONESHOT_PREAMBLE.format(role=role)
            + f"You are the **{role}**. No prior conversation. Respond to the user's message."
        )

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
    return _HARNESS_ONESHOT_PREAMBLE.format(role=role) + "\n".join(lines)


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
                 AND (c.role IS NULL OR c.role <> 'thinking')
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
    already_recorded: bool = False,
) -> None:
    """Process an assembly.comment.created event.

    1. Dedup via _seen set (protects both PG LISTEN and NATS paths)
    2. Query watch table → find target roles
    3. For each watch: coordinator → continue/delegate/close
    4. If continue: invoke agent → post response → consume lease

    already_recorded=True (P2 item 9) marks the session-event ingress: the
    comment.created row in duality.session_events was written FIRST by the
    /messages endpoint (the event stream is the source of truth), so the
    durable dedup-claim step below is skipped — the row's presence IS the
    claim, and the event must be DISPATCHED rather than treated as a
    duplicate delivery.
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
    request_comment_id = normalized.get("comment_id") or None

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

    # ── Durable dedup gate (P1 item 5) ──────────────────────────────
    # The comment.created row in duality.session_events doubles as the
    # durable dedup record for both ingresses (PG LISTEN + NATS) and across
    # subscriber restarts — the process-local _seen set above is only a fast
    # path. Inserting with ON CONFLICT DO NOTHING is the claim: a duplicate
    # delivery finds the row already present and is skipped. The comment's
    # own event_key means the log is exactly the replayable history.
    if request_comment_id and not already_recorded:
        # The comment.created row in duality.session_events doubles as the
        # durable dedup claim: an insert that conflicts (ON CONFLICT DO
        # NOTHING) means this comment was already processed — skip without
        # re-executing the turn. (The session-event ingress skips this: the
        # row already exists because it IS the source, P2 item 9.)
        claimed = _record_session_event(
            pg_conn,
            thread_id=thread_id,
            event_type="comment.created",
            event_key=f"comment:{request_comment_id}",
            payload={
                "comment_id": request_comment_id,
                "role": comment_role,
                "forum_slug": forum_slug,
            },
        )
        if not claimed:
            _log("Comment %s already processed — durable dedup skip",
                 str(request_comment_id)[:8])
            return

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
        plan_version = lease.get("model") if lease else None
        # P1 item 7: for the harness (ephemeral opencode) backend the
        # Tackle-resolved execution plan is authoritative — the lease model
        # is a Freebuff concept and must NOT be stamped as the plan (a stale
        # or bare lease model would bypass the canonical resolver). The
        # resolved plan version is filled in from the harness result below.
        initial_plan = None if backend == "harness" else plan_version

        # ── Turn envelope (P0-1 item 3) ──────────────────────────
        # Create the turn in 'accepted' state up front so the UI sees the
        # request has been picked up (rather than inferring from a comment
        # count). The terminal transition is written at each outcome below.
        turn_id = _create_turn(
            pg_conn, thread_id, watch_id, watch_role, backend,
            request_comment_id, execution_plan_version=initial_plan,
        )

        # ── Leased-mode gate (R1 hard stop, pre-invocation) ──────
        # 'freebuff' is the LEASED interactive path: an agent must have
        # acquired an ACTIVE role lease AND be in a polling loop for the
        # turn to run. Without one the send fails immediately with the
        # exact reason — no silent 90s timeout while nobody picks up the
        # NATS turn.requested.
        #
        # The watch is deliberately kept OPEN on this failure: closing it
        # orphans the session (the UI could no longer resume it, so the
        # error history became unreachable and messages looked like they
        # vanished). Staying active means every send to a lease-less role
        # fails fast with the same visible reason until a lease is issued.
        #
        # The gate failure is NOT a consumed turn: last_activity is touched
        # (so idle sweeps keep the session fresh while the user tries) but
        # turn_count is left alone — a lease-less role that keeps failing
        # must not burn its 20-turn budget on failures that never ran.
        if backend == "freebuff" and not _lease_valid(lease):
            reason = _lease_failure_reason(lease)
            _log("Watch %s: leased role %s has no valid lease — failing turn (%s)",
                 watch_id[:8], watch_role, reason)
            _post_assembly_comment(
                pg_conn,
                thread_id,
                f"[system] Agent {watch_role} encountered an error: {reason}",
                "system",
            )
            _set_turn_state(pg_conn, turn_id, "failed", failure_detail=reason)
            _touch_watch_activity(pg_conn, watch_id)
            continue

        if backend == "freebuff":
            # FreeBuff session already owns context — emit pointer event.
            # The session polls Assembly directly (duality-ui polling loop).
            # We do NOT bump turn_count here — the session owns its own
            # accounting. Lease consumption also handled by the session.
            # The turn stays 'accepted': the freebuff session owns the
            # reply, so the subscriber cannot observe completion.
            await _emit_turn_requested(nc, thread_id, watch_role, comment_role)
            continue

        # Build context appropriate for the backend
        if backend == "harness":
            # Full reconstruction for ephemeral OpenCode execution
            prompt = _build_thread_context(pg_conn, thread_id, watch_role)
        else:
            # operator: incremental — just the new comment, session has context
            prompt = _build_incremental_context(pg_conn, thread_id, watch_role, comment_role)

        _set_turn_state(pg_conn, turn_id, "running",
                        execution_plan_version=initial_plan)
        _log("Invoking %s via %s backend...", watch_role, backend)
        if backend == "harness":
            # No model override — harness-srv resolves the canonical Tackle
            # execution plan (P1 item 7).
            result = _invoke_agent_harness(
                role=watch_role,
                prompt=prompt,
            )
        else:
            result = _invoke_agent_operator(
                role=watch_role,
                prompt=prompt,
                model=plan_version,
            )

        stdout = result.get("stdout", "") or ""
        exit_code = result.get("exit_code", 1)

        if exit_code != 0:
            stderr = result.get("stderr", "") or ""
            stdout = result.get("stdout", "") or ""
            _log("Agent %s failed (exit=%s): %s",
                 watch_role, exit_code, stderr[:200])
            detail = _compose_failure_detail(
                stderr, stdout, exit_code, result.get("job_id")
            )
            _post_assembly_comment(
                pg_conn,
                thread_id,
                f"[system] Agent {watch_role} encountered an error: {detail}",
                "system",
            )
            # Distinguish a timeout (harness exit 124 / 'timeout after' in
            # stderr) from a plain failure so the envelope carries the
            # honest terminal state.
            if exit_code == 124 or "timeout" in (stderr or "").lower():
                _set_turn_state(pg_conn, turn_id, "timed_out",
                                failure_detail=detail, job_id=result.get("job_id"),
                                execution_plan_version=result.get("plan_version"))
            else:
                _set_turn_state(pg_conn, turn_id, "failed",
                                failure_detail=detail, job_id=result.get("job_id"),
                                execution_plan_version=result.get("plan_version"))
            _bump_turn_count(pg_conn, watch_id)
            continue

        # 4.5. Post the agent's reasoning trace ("thinking") BEFORE the
        #     response so the thread reads thinking → answer, matching the
        #     Freebuff UX. Only the harness (opencode JSON event stream)
        #     path carries reasoning today; leased freebuff sessions own
        #     their context and emit none here.
        trace = result.get("trace") or ""
        if isinstance(trace, str) and trace.strip():
            _post_assembly_comment(
                pg_conn,
                thread_id, trace[:4000], "thinking",
                model=lease.get("model") if lease else None,
            )
            _log("Posted reasoning trace for %s (%d chars)",
                 watch_role, min(len(trace), 4000))

        # 5. Post agent response
        response_preview = stdout[:3000]
        response_comment_id = _post_assembly_comment(
            pg_conn,
            thread_id, response_preview, watch_role,
            model=lease.get("model") if lease else None,
        )
        if response_comment_id:
            _log("Posted response as comment %s", response_comment_id[:8])

        # 5.5. Turn envelope: mark the turn completed with the response
        #      comment id so the UI can link request → response.
        _set_turn_state(pg_conn, turn_id, "completed",
                        response_comment_id=response_comment_id,
                        job_id=result.get("job_id"),
                        execution_plan_version=result.get("plan_version"))

        # 6. Re-check coordinator with the actual response.
        #    Harness (cloud executor) needs no role lease — it launches
        #    opencode/codex/gemini with a prompt. Treat its lease as
        #    always-valid so R1 doesn't close the watch after one turn.
        lease_for_resolution = (
            {"status": "ACTIVE", "budget_units": None,
             "consumed_units": 0, "expires_at": None}
            if backend == "harness"
            else lease
        )
        post_resolution = resolve_conversation_outcome(
            watch=watch,
            lease=lease_for_resolution,
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
#  Session-event ingress (P2 item 9 — event stream is the dispatch source)
# ═══════════════════════════════════════════════════════════════════════
# The durable duality.session_events log is the canonical transport for user
# messages: the /messages endpoint writes a comment.created envelope FIRST
# (source), then projects the Assembly comment (render). This ingress LISTENs
# on the duality_session_events channel (fired by the V113 AFTER INSERT
# trigger) and dispatches the turn from the typed envelope — the Assembly
# comment is no longer the dispatch trigger, only a projection.

def _fetch_session_event(
    pg_conn: Any,
    thread_id: str,
    seq: int,
) -> dict[str, Any] | None:
    """Fetch one duality.session_events row by (thread_id, seq).

    Returns the row as a dict with payload decoded to a dict (JSONB comes
    back from psycopg2 as a string unless a typecaster is registered), or
    None when the row does not exist.
    """
    with pg_conn.cursor() as cur:
        cur.execute(
            """SELECT seq, thread_id, turn_id, watch_id, event_type, payload,
                      created_at
               FROM duality.session_events
               WHERE thread_id = %s::uuid AND seq = %s
               LIMIT 1""",
            (thread_id, seq),
        )
        cols = [d[0] for d in cur.description]
        row = cur.fetchone()
    if not row:
        return None
    event = dict(zip(cols, row))
    payload = event.get("payload")
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = {}
    event["payload"] = payload if isinstance(payload, dict) else {}
    return event


async def _handle_session_event(
    nc: Any,
    pg_conn: Any,
    thread_id: str,
    seq: int,
) -> None:
    """Dispatch a turn from a duality.session_events NOTIFY (P2 item 9).

    Only comment.created envelopes are dispatch triggers (turn.* / thinking /
    watch.status envelopes are observation-only). The subscriber's own agent
    response also lands as a comment.created envelope with role == the watch
    role — the self-reply guard inside handle_comment_created skips it, so no
    dispatch loop. System/thinking roles are skipped up front.
    """
    event = _fetch_session_event(pg_conn, thread_id, seq)
    if not event:
        return
    if event["event_type"] != "comment.created":
        return
    payload = event["payload"]
    role = payload.get("role", "") or ""
    if role in ("system", "thinking"):
        return
    comment_id = payload.get("comment_id", "") or ""

    # Build a duality-conversation-shaped envelope so handle_comment_created
    # normalizes it via the flat branch. already_recorded=True because the
    # event row already exists (it IS the source — no durable dedup claim).
    envelope: dict[str, Any] = {
        "event_id": f"session-event:{seq}",
        "payload": {
            "thread_id": thread_id,
            "role": role,
            "comment_id": comment_id,
            "forum_slug": "",
        },
    }
    _log("session-event %s: comment.created (thread=%s, role=%s)",
         seq, thread_id[:8], role)
    await handle_comment_created(nc, pg_conn, envelope, already_recorded=True)


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
    1. PostgreSQL LISTEN on ``duality_session_events`` — the durable event
       stream is the dispatch source (P2 item 9). The /messages endpoint
       writes a comment.created envelope first and the V113 AFTER INSERT
       trigger NOTIFYs this channel; the Assembly comment is a projection,
       not the transport.
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
    # application_name tags this connection so liveness probes (nebula-srv
    # /api/cascade/subscriber-status → pg_stat_activity) can tell whether the
    # subscriber daemon is alive before a user sends a message.
    _log("Connecting to PostgreSQL...")
    pg_conn = psycopg2.connect(
        DATABASE_URL,
        application_name="cascade-interactive-turn",
    )
    pg_conn.set_isolation_level(
        psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT
    )
    _log("PostgreSQL connected")

    # ── LISTEN for session-event inserts (the durable dispatch source) ──
    # P2 item 9: the event stream is the transport; Assembly comments are a
    # projection. The V113 AFTER INSERT trigger NOTIFYs this channel with
    # { thread_id, seq }; we fetch the typed envelope and dispatch from it.
    _PG_LISTEN_CHANNEL = "duality_session_events"
    cur = pg_conn.cursor()
    cur.execute(f"LISTEN {_PG_LISTEN_CHANNEL};")
    _log("Listening on PostgreSQL channel '%s' for session events",
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
                        thread_id = payload.get("thread_id")
                        seq = payload.get("seq")
                        if not thread_id or seq is None:
                            continue
                        _log("PG NOTIFY: session-event (thread=%s seq=%s)",
                             str(thread_id)[:8], seq)
                        await _handle_session_event(
                            nc, pg_conn, str(thread_id), int(seq),
                        )
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
