"""
wr-conf-016: harness-srv async job contract (P1 item 6).

Guards the non-blocking execution contract that replaced blocking-only
POST /run-direct:

    POST /run-direct { async: true }
      → 202 { job_id, state: "accepted" }            (immediate)
      → background execution
      → GET /jobs/:jobId          — status envelope + RAW partial output
      → GET /jobs/:jobId/events   — replayable SSE (job.accepted/started,
                                    text.delta/thinking, terminal envelope)
      → POST /jobs/:jobId/interrupt — SIGTERM child / cancel → cancelled

Tested invariants:
  AC1 — 202 accept: async /run-direct returns 202 {job_id, state} fast.
  AC2 — Terminal envelope: polling GET /jobs/:jobId reaches a terminal
        state (completed|failed|timed_out) with exit_code + stdout/stderr
        preserved (exact exit metadata).
  AC3 — Event stream: GET /jobs/:jobId/events?after=0 replays connected +
        job.accepted + a terminal event.
  AC4 — Interrupt: POST /jobs/:jobId/interrupt on a fresh job → cancelled,
        exit_code 137.
  AC5 — Sync fallback: without async:true, /run-direct still returns the
        blocking result shape (backward compatibility).

Uses a synthetic tackle.roles persona + config_bundle pointing at the
existing harn-ollama-sdk harness (fast HTTP path; the model may be absent —
the terminal assertion accepts any honest outcome). Local-only (requires
harness-srv on :3420); CI skips.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_harness_async.py -v
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
import uuid

import pytest

_skip_if_ci = pytest.mark.skipif(
    os.environ.get("CI") == "true",
    reason="wr-conf-016 requires live harness-srv on :3420 (local only)",
)

_SELF_DIR = os.path.dirname(os.path.abspath(__file__))
_NEXUS_PYTHON = os.path.abspath(os.path.join(_SELF_DIR, "..", "..", ".."))
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

DSN = os.environ.get("CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus")
HARNESS_URL = os.environ.get("HARNESS_URL", "http://localhost:3420")

_OLLAMA_HARNESS_ID = "harn-ollama-sdk"
# A VERIFIED model (config_bundle_verified_gate forces is_active=0 for
# unverified models → ROLE_REVOKED). Pointed at the ollama harness, the
# direct-HTTP executor 404s fast (image not pulled) → a deterministic
# 'failed' terminal state that still exercises the full async lifecycle.
_OLLAMA_MODEL_ID = "mod-codellama-7b-opencode-ollama"


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


# ── HTTP helpers ────────────────────────────────────────────────────

def _post(path: str, body: dict):
    req = urllib.request.Request(
        f"{HARNESS_URL}{path}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8", "replace"))
        except Exception:
            return e.code, {"error": str(e)}


def _get(path: str):
    with urllib.request.urlopen(f"{HARNESS_URL}{path}", timeout=30) as resp:
        return resp.status, json.loads(resp.read())


def _job_envelope(job_id: str) -> dict:
    _, data = _get(f"/jobs/{job_id}")
    return data.get("job", {})


def _poll_terminal(job_id: str, timeout_s: float = 30.0) -> dict:
    deadline = time.time() + timeout_s
    last = {}
    while time.time() < deadline:
        last = _job_envelope(job_id)
        if last.get("state") in ("completed", "failed", "timed_out", "cancelled"):
            return last
        time.sleep(0.5)
    return last


def _submit_async(role: str, prompt: str, timeout_ms: int = 30_000):
    return _post("/run-direct", {
        "role": role,
        "prompt": prompt,
        "timeout_ms": timeout_ms,
        "channel": "wr-conf-016",
        "async": True,
    })


# ── Fixture: synthetic persona + config bundle ──────────────────────

@pytest.fixture(scope="module")
def test_role():
    role = f"wr-conf-016-{uuid.uuid4().hex[:8]}"
    _db_exec(
        "INSERT INTO tackle.roles (id, name, description) VALUES (%s::uuid, %s, %s)",
        (str(uuid.uuid4()), role, "wr-conf-016 harness async contract test persona"),
    )
    _db_exec(
        """INSERT INTO tackle.config_bundle
             (id, name, role, model_id, harness_id, priority, invocation_mode, is_active,
              metadata, valid_from, valid_to, created_at, updated_at)
           VALUES (%s::uuid, %s, %s, %s, %s, 0, 'CLI', 1, '{}'::jsonb,
                   now(), now() + interval '1 hour', now(), now())""",
        (str(uuid.uuid4()), f"wr-conf-016 bundle for {role}",
         role, _OLLAMA_MODEL_ID, _OLLAMA_HARNESS_ID),
    )
    yield role
    _db_exec("DELETE FROM tackle.config_bundle WHERE role = %s", (role,))
    _db_exec("DELETE FROM tackle.roles WHERE name = %s", (role,))


# ── AC1/AC2 — 202 accept + terminal envelope ────────────────────────

@_skip_if_ci
def test_01_async_accept_then_terminal(test_role):
    started = time.time()
    status, data = _submit_async(test_role, "Reply with the single word OK.")
    elapsed = time.time() - started
    assert status == 202, f"expected 202, got {status}: {data}"
    assert data.get("state") == "accepted", f"payload={data}"
    job_id = data.get("job_id")
    assert job_id, "job_id missing from 202 payload"
    assert elapsed < 10, "202 must return immediately, not block"

    terminal = _poll_terminal(job_id, timeout_s=30)
    assert terminal.get("state") in ("completed", "failed", "timed_out"), \
        f"terminal envelope={terminal}"
    assert terminal.get("exit_code") is not None, "exit_code must be preserved"
    assert "stdout" in terminal, "stdout field must be present (partial/full)"
    assert "stderr" in terminal
    assert terminal.get("duration_ms") is not None
    assert terminal.get("partial") is False, "terminal jobs must not be marked partial"


@_skip_if_ci
def test_02_event_stream_replay(test_role):
    status, data = _submit_async(test_role, "Reply with the single word OK.")
    assert status == 202
    job_id = data["job_id"]
    _poll_terminal(job_id, timeout_s=30)

    frames = []
    with urllib.request.urlopen(
        f"{HARNESS_URL}/jobs/{job_id}/events?after=0", timeout=15
    ) as resp:
        assert resp.status == 200
        assert "text/event-stream" in resp.headers.get("Content-Type", "")
        buf = b""
        while True:
            chunk = resp.read(1)
            if not chunk:
                break
            buf += chunk
            if buf.endswith(b"\n\n"):
                text = buf.decode()
                buf = b""
                event = ""
                for line in text.splitlines():
                    if line.startswith("event: "):
                        event = line[7:]
                if event:
                    frames.append(event)
                if event == "connected":
                    break  # connected is sent after backlog replay — stop reading

    assert "connected" in frames, f"frames={frames}"
    assert "job.accepted" in frames, f"frames={frames}"
    assert any(f in ("job.completed", "job.failed", "job.timed_out") for f in frames), \
        f"missing terminal job event: frames={frames}"


@_skip_if_ci
def test_03_interrupt_cancels_job(test_role):
    status, data = _submit_async(test_role, "Reply with the single word OK.",
                                 timeout_ms=120_000)
    assert status == 202
    job_id = data["job_id"]

    # Interrupt while accepted/running (ollama path has no child pid — the
    # direct-cancel branch marks it cancelled immediately).
    _, interrupt = _post(f"/jobs/{job_id}/interrupt", {})
    assert interrupt.get("job", {}).get("state") == "cancelled", \
        f"interrupt response={interrupt}"

    terminal = _poll_terminal(job_id, timeout_s=10)
    assert terminal.get("state") == "cancelled", f"terminal envelope={terminal}"
    assert terminal.get("exit_code") == 137


@_skip_if_ci
def test_04_sync_contract_still_blocks(test_role):
    # Backward compatibility: without async:true the response is the
    # blocking result shape (job completed/failed inline).
    status, data = _post("/run-direct", {
        "role": test_role,
        "prompt": "Reply with the single word OK.",
        "timeout_ms": 30_000,
        "channel": "wr-conf-016",
    })
    assert status == 200, f"expected 200, got {status}: {data}"
    assert "exit_code" in data, f"sync result shape missing exit_code: {data}"
    assert "stdout" in data
    assert "job_id" in data


@_skip_if_ci
def test_05_unqualified_override_rejected(test_role):
    # P1 item 7 — a bare/stale model override must not bypass the canonical
    # Tackle resolver (provider-qualified ids only).
    status, data = _post("/run-direct", {
        "role": test_role,
        "prompt": "Reply with the single word OK.",
        "model": "big-pickle",  # bare — no provider prefix
    })
    assert status == 400, f"expected 400, got {status}: {data}"
    assert "unqualified model override" in data.get("error", ""), f"payload={data}"


@_skip_if_ci
def test_06_plan_in_envelope(test_role):
    # P1 item 7 — the 202 accept + terminal envelope carry the Tackle-
    # resolved versioned execution plan.
    status, data = _submit_async(test_role, "Reply with the single word OK.")
    assert status == 202
    plan = data.get("plan", {})
    assert plan.get("resolved_by") == "tackle", f"plan={plan}"
    assert plan.get("plan_version"), f"plan missing plan_version: {plan}"
    assert "/" in plan.get("model", ""), \
        f"model must be provider-qualified: {plan.get('model')}"

    terminal = _poll_terminal(data["job_id"], timeout_s=30)
    job_plan = terminal.get("plan", {})
    assert job_plan.get("resolved_by") == "tackle", f"job plan={job_plan}"
    assert job_plan.get("plan_version") == plan.get("plan_version"), \
        f"job envelope plan version differs: {job_plan}"
