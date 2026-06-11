import argparse
import atexit
import fcntl
import json
import os
import re
import signal
import subprocess
import sys
import time
from datetime import datetime
from typing import Optional
from db_adapter import DBAdapter
from env_config import load_env  # shared .env loader; load_env() fires at import time
from executor_registry import ModelConfig, RegistryConfig, load_registry, resolve_executor
from work_request_factory import WorkRequestFactory


# ── Env vars loaded above ───────────────────────────────────────────

DEFAULT_DB_PATH = os.environ.get("PIPELINE_DB_PATH", "/home/codex/dev/nexus/.conduit-data/pipeline.db")
LOCK_PATH = os.environ.get("PIPELINE_LOCK_PATH", "/tmp/pipeline-manager.lock")
DCO_DIR = os.environ.get("PIPELINE_DCO_DIR", "/home/codex/dev/nexus/.conduit-data/WORK_REQUESTS")
_DEFAULT_ROOT = os.path.dirname(os.path.dirname(DEFAULT_DB_PATH))
PROJECT_ROOT = os.environ.get("PIPELINE_ROOT", _DEFAULT_ROOT)

EXECUTOR_TIMEOUT_SECONDS = int(os.environ.get("PIPELINE_EXECUTOR_TIMEOUT", "1800"))
WATCHDOG_STALE_SECONDS = int(os.environ.get("PIPELINE_WATCHDOG_STALE", "1800"))
LOCK_STALE_SECONDS = int(os.environ.get("PIPELINE_LOCK_STALE", "3600"))

# ── Rate-limit retry (v090) ───────────────────────────────────────
API_LIMIT_RETRY_DELAY = int(os.environ.get("API_LIMIT_RETRY_DELAY", "300"))   # 5 minutes
API_LIMIT_MAX_RETRIES = int(os.environ.get("API_LIMIT_MAX_RETRIES", "5"))     # 5 × 300s = 25 min (under 30-min stale threshold)
_retry_delay_seconds = API_LIMIT_RETRY_DELAY
_retry_max_attempts = API_LIMIT_MAX_RETRIES

_lock_fd = None


def _kill_process_tree(pid: int, sig: int = signal.SIGKILL) -> None:
    try:
        pgid = os.getpgid(pid)
        os.killpg(pgid, sig)
    except (ProcessLookupError, OSError):
        try:
            os.kill(pid, sig)
        except (ProcessLookupError, OSError):
            pass


def _cleanup_orphaned_processes() -> None:
    orphans_killed = 0
    try:
        result = subprocess.run(
            ["ps", "-eo", "pid,etime,cmd", "--no-headers"],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            parts = line.strip().split(None, 2)
            if len(parts) < 3:
                continue
            pid_str, elapsed, cmd = parts
            if not pid_str.isdigit():
                continue
            pid = int(pid_str)
            if pid == os.getpid():
                continue
            if "executor_cloud.py" in cmd or "opencode" in cmd:
                total_seconds = _parse_elapsed(elapsed)
                if total_seconds is not None and total_seconds > WATCHDOG_STALE_SECONDS:
                    print(f"Orphan cleanup: Killing stale process PID {pid} (elapsed {elapsed}): {cmd[:80]}...")
                    _kill_process_tree(pid)
                    orphans_killed += 1
    except Exception as e:
        print(f"Orphan cleanup: scan failed ({e}), continuing.")
    if orphans_killed:
        print(f"Orphan cleanup: killed {orphans_killed} stale process(es).")


def _parse_elapsed(elapsed: str) -> Optional[int]:
    try:
        parts = elapsed.split("-")
        days = 0
        time_part = elapsed
        if len(parts) == 2:
            days = int(parts[0])
            time_part = parts[1]
        time_parts = [int(x) for x in time_part.split(":")]
        if len(time_parts) == 3:
            h, m, s = time_parts
        elif len(time_parts) == 2:
            h, m, s = 0, time_parts[0], time_parts[1]
        elif len(time_parts) == 1:
            h, m, s = 0, 0, time_parts[0]
        else:
            return None
        return days * 86400 + h * 3600 + m * 60 + s
    except (ValueError, IndexError):
        return None


def _is_lock_stale() -> bool:
    try:
        with open(LOCK_PATH, "r") as f:
            pid_str = f.read().strip()
        if not pid_str.isdigit():
            return True
        pid = int(pid_str)
        os.kill(pid, 0)
        mtime = os.path.getmtime(LOCK_PATH)
        age = datetime.now().timestamp() - mtime
        if age > LOCK_STALE_SECONDS:
            print(f"Lock file is {int(age)}s old (holder PID {pid} alive). Force-breaking stale lock.")
            _kill_process_tree(pid)
            return True
        return False
    except (FileNotFoundError, ProcessLookupError, OSError):
        return True


def acquire_lock() -> bool:
    global _lock_fd
    try:
        _lock_fd = open(LOCK_PATH, "w")
        fcntl.flock(_lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        _lock_fd.write(f"{os.getpid()}\n")
        _lock_fd.flush()
        atexit.register(release_lock)
        return True
    except (IOError, BlockingIOError):
        if _lock_fd:
            _lock_fd.close()
            _lock_fd = None
        if _is_lock_stale():
            print("Stale lock detected. Force-acquiring.")
            try:
                os.remove(LOCK_PATH)
            except OSError:
                pass
            try:
                _lock_fd = open(LOCK_PATH, "w")
                fcntl.flock(_lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                _lock_fd.write(f"{os.getpid()}\n")
                _lock_fd.flush()
                atexit.register(release_lock)
                return True
            except (IOError, BlockingIOError):
                if _lock_fd:
                    _lock_fd.close()
                    _lock_fd = None
                return False
        return False


def release_lock():
    global _lock_fd
    if _lock_fd:
        try:
            fcntl.flock(_lock_fd, fcntl.LOCK_UN)
            _lock_fd.close()
        except Exception:
            pass
        _lock_fd = None


def get_model(db: DBAdapter, registry: RegistryConfig, role: str = "builder") -> ModelConfig:
    """Resolve the harness + model for *role* from the DB AI config.

    Falls back to ``registry.default_model`` when:
    - The circuit breaker is tripped (returns fallback_model instead)
    - The DB has no role config for *role*
    - The DB lookup fails
    """
    if db.is_circuit_breaker_tripped():
        return registry.fallback_model

    try:
        cfg = db.get_role_model_config(role)
        if cfg and cfg.get("harness") and cfg.get("model"):
            return ModelConfig(harness=cfg["harness"], model=cfg["model"])
    except Exception:
        pass

    return registry.default_model


# ── API usage limit detection patterns (v075) ──────────────────────
_API_LIMIT_PATTERNS = [
    "usage limit",
    "rate limit",
    "usage exceeded",
    "api usage",
    "insufficient_quota",
    "quota exceeded",
    "billing",
    "credit",
    "429",
    "402",
    "exceeded your current quota",
    "your account must be",
    "payment required",
    "freeusagelimiterror",       # opencode stream FreeUsageLimitError
]


def _detect_api_limit_error(exit_code: int, output: str) -> bool:
    """Detect API usage limit / rate limit errors in executor output.

    Checks the output text for known patterns regardless of exit code.
    Rate-limit errors can arrive as stream errors (exit 0/1) or as
    hard failures (exit 3 from the opencode harness).
    """
    output_lower = output.lower()
    for pattern in _API_LIMIT_PATTERNS:
        if pattern in output_lower:
            return True
    return False


def _extract_tokens_from_output(output: str) -> int:
    """Scan executor stdout for token consumption data.

    opencode --print-logs --log-level DEBUG typically emits lines like:
      token_usage: {"input": 1234, "output": 567, "total": 1801}
      Tokens used: 1801
      total_tokens=1801

    Also handles the `opencode stats` summary format.
    """
    # Known patterns, ordered by specificity
    patterns = [
        r'"total"\s*:\s*(\d+)',               # JSON token_usage blob
        r'"total_tokens"\s*:\s*(\d+)',        # alt JSON key
        r'Total tokens?\s*[:=]\s*([\d,]+)',   # human-readable total
        r'total_tokens\s*=\s*(\d+)',          # key=value
        r'tokens?_?used\s*[:=]\s*([\d,]+)',   # tokens_used: N
        r'Tokens:\s*([\d,]+)',                 # Tokens: N
    ]
    for pat in patterns:
        m = re.search(pat, output, re.IGNORECASE)
        if m:
            try:
                return int(m.group(1).replace(",", ""))
            except ValueError:
                continue
    return 0


# ── v078: Receipt-type mappings (used after work completes) ────────
_SUCCESS_RECEIPTS = {
    "builder": "IMPLEMENTATION",
    "reviewer": "REVIEW_PASS",
    "planner": "PLAN_CREATE",
    "critic": "CRITIQUE",
}
_FAIL_RECEIPTS = {
    "builder": "BLOCK",
    "reviewer": "REVIEW_REJECT",
    "planner": "PLAN_BLOCK",
    "critic": "CRITIQUE_REJECT",
}


def _dispatch_one(
    plan: dict,
    role: str,
    db: DBAdapter,
    registry: RegistryConfig,
    model_cfg,
) -> None:
    """Normalize a single plan into a DCO and dispatch to the executor.

    v078: Tickets own authority.  A Ticket is claimed before any work.
    Receipts are linked to their Ticket (Invariant 2).  On terminal
    state, next Tickets are created deterministically (Invariant 5).
    """
    plan_id = plan["id"]
    cursor_before = db.get_cursor(role)
    print(f"Processing plan: {plan_id} - {plan.get('title', '')} for role {role}")
    print(f"  cursor before: {cursor_before or '(none)'}")

    session_id = f"{role}-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
    db.create_session(session_id, role, [plan_id])

    # ── Claim the Ticket (Invariant 1: no work without a Ticket) ──
    ticket_id = db.claim_ticket(plan_id, role, session_id)
    if not ticket_id:
        print(f"  Ticket for {role} on plan {plan_id} was already claimed. Skipping.")
        db.close_session(session_id, 1)
        return
    print(f"  Ticket {ticket_id} claimed for {role} on plan {plan_id}.")

    # ── Normalize into WorkRequest DCO ──
    dco = WorkRequestFactory.create_from_plan(plan, role=role, model_cfg=model_cfg, working_path=PROJECT_ROOT, session_id=session_id)
    wr_id = dco.id

    os.makedirs(DCO_DIR, exist_ok=True)
    dco_path = os.path.join(DCO_DIR, f"{wr_id}.json")
    with open(dco_path, "w") as f:
        json.dump(dco.model_dump(by_alias=True), f, indent=2)

    db.add_work_request(wr_id, plan_id, json.dumps(dco.model_dump(by_alias=True)))

    # ── Resolve executor ──
    executor = resolve_executor(registry, model_cfg.harness)
    executor_cmd = executor.invocation_contract.command
    if not executor_cmd:
        db.release_ticket(plan_id, role, session_id)
        db.close_session(session_id, 1)
        raise ValueError(
            f"Executor '{executor.executor_id}' has no command in its invocation_contract"
        )

    # ── Execute with rate-limit retry loop (v090) ────────────────
    print(f"  Executor '{executor.executor_id}' ({model_cfg.harness}) → {wr_id}")
    tokens_used = 0
    exit_code = -1  # sentinel
    try:
        for attempt in range(1, _retry_max_attempts + 1):
            print(f"  Execution attempt {attempt}/{_retry_max_attempts}")
            work_start = time.time()
            proc = subprocess.Popen(
                [sys.executable, executor_cmd, dco_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                start_new_session=True,
            )
            db.update_session_activity(session_id, pid=proc.pid)
            try:
                stdout, _ = proc.communicate(timeout=EXECUTOR_TIMEOUT_SECONDS)
                exit_code = proc.returncode
            except subprocess.TimeoutExpired:
                print(f"  TIMEOUT: executor exceeded {EXECUTOR_TIMEOUT_SECONDS}s. Killing process tree (PID {proc.pid}).")
                _kill_process_tree(proc.pid)
                try:
                    stdout, _ = proc.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    stdout, _ = proc.communicate(timeout=5)
                exit_code = 124

            # Accumulate actual work time (excludes retry sleeps)
            work_elapsed = time.time() - work_start
            db.add_session_work_time(session_id, work_elapsed)

            output_text = stdout or ""
            tokens_used = _extract_tokens_from_output(output_text)

            # ── Sync plan files to DB (v088) ─────────────────────
            _sync_plan_files_to_db(db, PROJECT_ROOT)

            # ── Success ──────────────────────────────────────────
            if exit_code == 0:
                db.update_work_request_status(wr_id, "completed")
                db.close_ticket(plan_id, role, session_id, "completed")

                db.insert_receipt(
                    plan_id=plan_id,
                    receipt_type=_SUCCESS_RECEIPTS.get(role, "IMPLEMENTATION"),
                    agent_role=role,
                    session_id=session_id,
                    ticket_id=ticket_id,
                    summary=f"{role} completed successfully via {wr_id}",
                    metadata={
                        "work_request_id": wr_id,
                        "role": role,
                        "harness": model_cfg.harness,
                        "model": model_cfg.model,
                        "exit_code": 0,
                    },
                    tokens_used=tokens_used,
                )
                if tokens_used > 0:
                    db.increment_ticket_tokens(ticket_id, tokens_used)

                created = db.create_next_tickets(
                    plan_id, role, "completed",
                    parent_ticket_id=ticket_id,
                    objective=plan.get("title") or plan.get("goal", ""),
                    completion_criteria=plan.get("acceptance_criteria", ""),
                    owner=role,
                )
                if created:
                    print(f"  Created {created} next Ticket(s) after {role} completed.")
                break  # exit retry loop

            # ── Rate limit → sleep & retry ───────────────────────
            if _detect_api_limit_error(exit_code, output_text):
                print(f"  Rate limit hit (attempt {attempt}/{_retry_max_attempts}).")
                error_summary = "API usage limit reached"
                for line in output_text.splitlines():
                    line_lower = line.lower()
                    if any(p in line_lower for p in ["limit", "quota", "usage", "credit", "429"]):
                        error_summary = line.strip()[:200]
                        break

                db.update_work_request_status(wr_id, "rate_limited")
                db.insert_receipt(
                    plan_id=plan_id,
                    receipt_type="API_LIMIT",
                    agent_role=role,
                    session_id=session_id,
                    ticket_id=ticket_id,
                    summary=f"Rate limit retry {attempt}/{_retry_max_attempts}: {error_summary}",
                    metadata={
                        "work_request_id": wr_id,
                        "role": role,
                        "harness": model_cfg.harness,
                        "model": model_cfg.model,
                        "exit_code": exit_code,
                        "attempt": attempt,
                    },
                    tokens_used=tokens_used,
                )
                if tokens_used > 0:
                    db.increment_ticket_tokens(ticket_id, tokens_used)

                if attempt < _retry_max_attempts:
                    print(f"  Waiting {_retry_delay_seconds}s before retry...")
                    time.sleep(_retry_delay_seconds)
                    # Stay in retry loop — ticket stays claimed
                    continue
                else:
                    print(f"  Retries exhausted for {role} on plan {plan_id}. Closing as failed.")
                    db.update_work_request_status(wr_id, "failed")
                    db.close_ticket(plan_id, role, session_id, "failed")
                    created = db.create_next_tickets(
                        plan_id, role, "failed",
                        parent_ticket_id=ticket_id,
                        objective=plan.get("title") or plan.get("goal", ""),
                        owner=role,
                    )
                    if created:
                        print(f"  Created {created} retry Ticket(s) after retries exhausted.")
                    break

            # ── Non-rate-limit failure ───────────────────────────
            print(f"  {role} failed with exit code {exit_code} (not a rate limit).")
            db.update_work_request_status(wr_id, "failed")
            db.close_ticket(plan_id, role, session_id, "failed")

            db.insert_receipt(
                plan_id=plan_id,
                receipt_type=_FAIL_RECEIPTS.get(role, "BLOCK"),
                agent_role=role,
                session_id=session_id,
                ticket_id=ticket_id,
                summary=f"{role} failed with exit code {exit_code}",
                metadata={
                    "work_request_id": wr_id,
                    "role": role,
                    "harness": model_cfg.harness,
                    "model": model_cfg.model,
                    "exit_code": exit_code,
                },
                tokens_used=tokens_used,
            )
            if tokens_used > 0:
                db.increment_ticket_tokens(ticket_id, tokens_used)
            created = db.create_next_tickets(
                    plan_id, role, "failed",
                    parent_ticket_id=ticket_id,
                    objective=plan.get("title") or plan.get("goal", ""),
                    owner=role,
                )
            if created:
                print(f"  Created {created} next Ticket(s) after {role} failed.")
            break

        # ── Post-loop: advance cursor & close session ────────────
        db.advance_cursor(role, plan_id, wr_id)
        cursor_after = db.get_cursor(role)
        print(f"  cursor after: {cursor_after}")
        db.close_session(session_id, exit_code)

    except Exception as e:
        print(f"  Error during {role} execution: {e}")
        error_text = str(e)
        if _detect_api_limit_error(3, error_text):
            print(f"  Rate limit detected in exception. Waiting {_retry_delay_seconds}s then closing.")
            db.insert_receipt(
                plan_id=plan_id,
                receipt_type="API_LIMIT",
                agent_role=role,
                session_id=session_id,
                ticket_id=ticket_id,
                summary=f"API limit via exception: {error_text[:200]}",
                metadata={
                    "work_request_id": wr_id,
                    "role": role,
                    "harness": model_cfg.harness,
                    "model": model_cfg.model,
                    "exception": error_text[:500],
                },
                tokens_used=tokens_used,
            )
            if tokens_used > 0:
                db.increment_ticket_tokens(ticket_id, tokens_used)
            time.sleep(_retry_delay_seconds)
            db.update_work_request_status(wr_id, "failed")
            db.close_ticket(plan_id, role, session_id, "failed")
            db.create_next_tickets(
                plan_id, role, "failed",
                parent_ticket_id=ticket_id,
                objective=plan.get("title") or plan.get("goal", ""),
                owner=role,
            )
        else:
            db.close_ticket(plan_id, role, session_id, "failed")
            db.insert_receipt(
                plan_id=plan_id,
                receipt_type=_FAIL_RECEIPTS.get(role, "BLOCK"),
                agent_role=role,
                session_id=session_id,
                ticket_id=ticket_id,
                summary=f"{role} crashed: {error_text[:200]}",
                metadata={
                    "work_request_id": wr_id,
                    "role": role,
                    "harness": model_cfg.harness,
                    "model": model_cfg.model,
                    "exit_code": -1,
                    "exception": error_text[:500],
                },
                tokens_used=tokens_used,
            )
            if tokens_used > 0:
                db.increment_ticket_tokens(ticket_id, tokens_used)
            db.create_next_tickets(
                    plan_id, role, "failed",
                    parent_ticket_id=ticket_id,
                    objective=plan.get("title") or plan.get("goal", ""),
                    owner=role,
                )
        db.advance_cursor(role, plan_id, wr_id)
        cursor_after = db.get_cursor(role)
        print(f"  cursor after (error): {cursor_after}")
        db.close_session(session_id, 1)


def dispatch_single_plan(
    plan_id: str,
    db: DBAdapter,
    registry: RegistryConfig,
    force: bool = False,
) -> None:
    """Dispatch a builder for a single plan, bypassing cursor/pause/breaker checks."""
    if not force and db.is_circuit_breaker_tripped():
        print(f"Restart blocked: circuit breaker is tripped. Use --force to override.")
        return

    active = db.get_active_session("builder")
    if active:
        pid = active.get("pid")
        if pid:
            try:
                os.kill(pid, 0)
                print(f"Builder session {active['id']} (PID {pid}) is still active. Cannot restart.")
                return
            except ProcessLookupError:
                print(f"Stale builder session {active['id']} (PID {pid}). Closing and releasing Tickets.")
                db.release_session_tickets(active["id"])
                db.close_session(active["id"], 137)
        else:
            db.release_session_tickets(active["id"])
            db.close_session(active["id"], 1)

    plan_row = db.get_plan_by_id(plan_id)
    if not plan_row:
        print(f"Plan {plan_id} not found.")
        return

    plan = dict(plan_row)
    print(f"Restarting builder for plan: {plan_id} - {plan.get('title', '')}")

    # Ensure a builder Ticket exists (restart is explicit authorization)
    now = datetime.utcnow().isoformat() + "Z"
    db.create_ticket_if_missing(plan_id, "builder", "restart-v078", now)

    model_cfg = get_model(db, registry, "builder")
    _dispatch_one(plan, "builder", db, registry, model_cfg)


def run_role(db_path: str, role: str, registry: RegistryConfig):
    db = DBAdapter(db_path)

    if db.is_conduit_paused():
        print(f"Pipeline is paused. Skipping role {role}.")
        return

    active_sessions = db.get_all_active_sessions()
    for active_session in active_sessions:
        session_role = active_session.get("agent_role", "")
        pid = active_session.get("pid")
        if pid:
            try:
                os.kill(pid, 0)
                total_work = active_session.get("total_work_seconds", 0) or 0
                if total_work > WATCHDOG_STALE_SECONDS:
                    print(f"Watchdog: Killing stale session {active_session['id']} (role={session_role}, PID {pid}, total_work={int(total_work)}s)")
                    _kill_process_tree(pid)
                    db.release_session_tickets(active_session["id"])
                    db.close_session(active_session["id"], 137)
                else:
                    print(f"Session {active_session['id']} (role={session_role}) still active ({int(total_work)}s work so far).")
                    if session_role == role:
                        return
            except ProcessLookupError:
                print(f"Watchdog: Session {active_session['id']} (role={session_role}) PID {pid} is dead. Closing.")
                db.release_session_tickets(active_session["id"])
                db.close_session(active_session["id"], 1)
        else:
            print(f"Session {active_session['id']} (role={session_role}) has no PID. Closing.")
            db.release_session_tickets(active_session["id"])
            db.close_session(active_session["id"], 1)

    # ── S2a: Detect stale/expired Tickets before eligibility (v079) ──
    stale = db.detect_stale_tickets()
    expired = db.detect_expired_tickets()
    if stale or expired:
        print(f"Ticket lifecycle: {stale} stale, {expired} expired.")

    eligible_plans = db.get_eligible_plans(role)

    if role == "planner":
        blocked = db.get_blocked_plans()
        if blocked:
            print(f"Found {len(blocked)} blocked plans.")

    if not eligible_plans:
        print(f"No eligible plans for role {role}.")
        return

    print(f"Found {len(eligible_plans)} eligible plan(s) for role {role}.")
    model_cfg = get_model(db, registry, role)

    for plan in eligible_plans:
        _dispatch_one(plan, role, db, registry, model_cfg)


def clean_test_artifacts(db_path: str) -> None:
    db = DBAdapter(db_path)
    with db._get_connection() as conn:
        rows = conn.execute(
            "SELECT id, plans_processed FROM sessions WHERE exit_code = 3"
        ).fetchall()
        if not rows:
            print("No test artifacts found.")
            return
        count = 0
        for session_id, plans_json in rows:
            try:
                plan_ids = json.loads(plans_json)
            except Exception:
                continue
            for plan_id in plan_ids:
                conn.execute(
                    "DELETE FROM receipts WHERE plan_id = ? AND session_id = ? AND type = 'BLOCK'",
                    (plan_id, session_id),
                )
                count += conn.total_changes
        conn.commit()
        print(f"Cleaned {count} test-artifact receipt(s) from {len(rows)} session(s).")


def print_status(db_path: str, registry: RegistryConfig) -> None:
    db = DBAdapter(db_path)
    roles = ["builder", "reviewer", "planner", "critic"]

    print("=== Pipeline Status ===")
    print(f"  Timestamp: {datetime.utcnow().isoformat()}Z")

    tripped = db.is_circuit_breaker_tripped()
    print(f"  Circuit breaker: {'TRIPPED' if tripped else 'ok'}")

    model_cfg = get_model(db, registry, "builder")
    print(f"  Active model: {model_cfg.harness}/{model_cfg.model}")

    blocked_count = len(db.get_blocked_plans())
    print("\n  Role          Cursor         Eligible  Blocked  Tokens")
    print("  ────          ──────         ────────  ───────  ──────")
    for role in roles:
        cursor = db.get_cursor(role)
        eligible = len(db.get_eligible_plans(role))
        blocked = blocked_count if role == "planner" else 0
        tok = db.get_token_usage_by_role(role)
        tokens = tok.get("total_tokens", 0)
        print(f"  {role:12}  {cursor or '(none)':14}  {eligible:8}  {blocked:7}  {tokens:6}")


def _sync_plan_files_to_db(db: DBAdapter, conduit_data_dir: str) -> None:
    """Tell the MCP server to scan the filesystem and upsert missing plan rows.

    Uses the ``POST /plans/sync`` endpoint on the conduit MCP server. This
    ensures that plan files created by the harness (e.g., planner agent) have
    corresponding DB rows before any receipts are issued.  Best-effort — if
    the MCP server is unreachable the call is skipped.
    """
    try:
        from urllib.request import Request, urlopen
        mcp_url = os.environ.get("MCP_BASE_URL", "http://localhost:3100")
        req = Request(f"{mcp_url}/plans/sync", method="POST", data=b"{}")
        req.add_header("Content-Type", "application/json")
        resp = urlopen(req, timeout=5)
        body = resp.read().decode("utf-8")
        result = json.loads(body)
        synced = result.get("synced", 0)
        if synced > 0:
            print(f"  Synced {synced} new plan file(s) to DB.")
    except Exception as e:
        # Best-effort — the PlanWatcher will catch up asynchronously
        print(f"  Note: /plans/sync call failed ({e}). PlanWatcher will catch up.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pipeline Manager")
    parser.add_argument("--db", default=DEFAULT_DB_PATH, help="Path to pipeline database")
    parser.add_argument("--registry", help="Path to registry.json (default: auto-locate)")
    parser.add_argument("--status", action="store_true", help="Print pipeline status and exit (no lock)")
    parser.add_argument("--clean-test-artifacts", action="store_true", help="Remove test receipts (exit code 3 BLOCKs) and exit")
    parser.add_argument("--run", choices=["builder", "reviewer", "planner", "critic"], help="Run the conduit for a specific role")
    parser.add_argument("--plan", help="Dispatch a builder for a single plan ID (bypasses cursor/pause)")
    parser.add_argument("--force", action="store_true", help="Override circuit breaker block when using --plan")
    parser.add_argument("--all", action="store_true", help="Run for all roles sequentially")
    parser.add_argument("--supersede", help="Supersede a ticket by ID (mark terminal, optionally create replacement)")
    parser.add_argument("--supersede-reason", default="", help="Reason for superseding (used with --supersede)")
    parser.add_argument("--supersede-replace", action="store_true", help="Also create a replacement ticket (used with --supersede)")
    parser.add_argument("--cancel", help="Cancel a ticket by ID (mark terminal, deny authorization)")
    parser.add_argument("--cancel-reason", default="", help="Reason for cancelling (used with --cancel)")

    args = parser.parse_args()
    registry = load_registry(args.registry)

    if args.clean_test_artifacts:
        clean_test_artifacts(args.db)
        sys.exit(0)

    if args.status:
        print_status(args.db, registry)
        sys.exit(0)

    _cleanup_orphaned_processes()

    if not acquire_lock():
        print("Another conduit instance is running. Exiting.")
        sys.exit(0)

    registry = load_registry(args.registry)

    if args.cancel:
        ticket_id = args.cancel
        if not ticket_id.startswith("ticket-"):
            print(f"Error: {ticket_id} doesn't look like a ticket ID (expected 'ticket-...')")
            sys.exit(1)
        db = DBAdapter(args.db)
        count = db.cancel_ticket(
            ticket_id,
            reason=args.cancel_reason or "cancelled from CLI",
        )
        if count > 0:
            print(f"Ticket {ticket_id} cancelled.")
        else:
            print(f"Ticket {ticket_id} not found or not cancellable.")
            sys.exit(1)
    elif args.supersede:
        ticket_id = args.supersede
        if not ticket_id.startswith("ticket-"):
            print(f"Error: {ticket_id} doesn't look like a ticket ID (expected 'ticket-...')")
            sys.exit(1)
        db = DBAdapter(args.db)
        result = db.supersede_ticket(
            ticket_id,
            reason=args.supersede_reason or "superseded from CLI",
        )
        if result.get("superseded"):
            print(f"Ticket {ticket_id} superseded.")
            if args.supersede_replace:
                old = result.get("old_ticket", {})
                if old:
                    # v081: Use timestamp-based ID to avoid clashes on repeated supersede+replace
                    now = datetime.utcnow().isoformat() + "Z"
                    ts = int(datetime.utcnow().timestamp())
                    repl = db.create_ticket_if_missing(
                        old["plan_id"], old["role"],
                        f"supersede-replace-{ts}", now,
                        objective=old.get("objective") or "",
                        owner=old.get("owner") or old.get("role", ""),
                        parent_ticket_id=ticket_id,
                        spawn_reason="replacement after supersede",
                        replacement_of=ticket_id,
                    )
                    if repl:
                        print(f"  Replacement ticket: {repl}")
                    else:
                        print(f"  Replacement ticket already exists (idempotent).")
        else:
            print(f"Ticket {ticket_id} not found or not supersedeable.")
            sys.exit(1)
    elif args.plan:
        db = DBAdapter(args.db)
        dispatch_single_plan(args.plan, db, registry, force=args.force)
    elif args.run:
        run_role(args.db, args.run, registry)
    elif args.all:
        # Run reviewer first, then planner + builder back-to-back so
        # planner-created builder tickets dispatch on the same cycle.
        # Critic runs last so builder always precedes it on every cycle.
        # Ticket chain: planner→builder+critic, builder→reviewer, critic→builder.
        for role in ["reviewer", "planner", "builder", "critic"]:
            run_role(args.db, role, registry)
    else:
        parser.print_help()
