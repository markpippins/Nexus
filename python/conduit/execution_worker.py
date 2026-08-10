#!/usr/bin/env python3
"""Conduit-native execution worker — the missing READY consumer.

Architect decision 096bab33 (2026-08-09) retired legacy DCO-file dispatch;
``vision.work_requests`` + ``execution.requests`` + cascade admission are
the ONLY dispatch authority. The cascade-admission subscriber mirrors
WorkRequests into ``execution.requests`` with status READY — but until now
no live executor consumed those rows. This worker closes that gap:

    reconcile eligible plans → READY execution requests
        (get_eligible_plans + get_or_create_execution_request)
    for each READY request:
        acquire lease (mutual exclusion)
        claim builder ticket (Invariant 1)
        create + start attempt
        run real opencode builder via executor_cloud.run_opencode
        complete attempt + issue execution receipt
        release lease, mark request COMPLETED / FAILED
        advance conduit plan lifecycle:
            IMPLEMENTATION receipt (success) / BLOCK (failure),
            close ticket, advance cursor, create next tickets (Invariant 5)

Execution Authority protocol (ADR-006) is reused wholesale from
``db_adapter.py``; harness launch is reused from ``executor_cloud.py``
(HarnessLauncher + model chain via tackle → GLM 5.2).

Usage:
    python3 execution_worker.py --status             # show READY backlog
    python3 execution_worker.py --dry-run            # reconcile + report, launch nothing
    python3 execution_worker.py --once               # single pass
    python3 execution_worker.py --loop               # daemon (default)
    python3 execution_worker.py --interval 60        # poll seconds
    python3 execution_worker.py --executor-id conduit-worker
    python3 execution_worker.py --include-legacy     # also consume non-plan READY rows
"""

import argparse
import json
import logging
import os
import sys
import threading
import time
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db_adapter import DBAdapter  # noqa: E402
from env_config import load_env  # noqa: E402 — shared .env loader (fires at import)
import executor_cloud  # noqa: E402
from executor_registry import ModelConfig  # noqa: E402
from work_request_factory import WorkRequestFactory  # noqa: E402

_log = logging.getLogger("execution_worker")
_handler = logging.StreamHandler()
_handler.setFormatter(logging.Formatter(
    "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%dT%H:%M:%S"))
_log.addHandler(_handler)
_log.setLevel(logging.INFO)

PROJECT_ROOT = os.environ.get("PIPELINE_ROOT", "/home/codex/dev")
ROLE = "builder"
SUCCESS_RECEIPT = "IMPLEMENTATION"
FAIL_RECEIPT = "BLOCK"
LEASE_TTL = 600  # 10 min — renewed in the background during a run; crash recovery ≤10 min
RENEW_INTERVAL = 240  # renew every 4 min (well inside the 10-min TTL)


def _log_ok(msg: str):
    print(f"  ✓ {msg}")


def _log_warn(msg: str):
    print(f"  ! {msg}")


def _list_ready(db: DBAdapter, include_legacy: bool, eligible_plan_ids: set) -> list[dict]:
    """Fetch READY execution requests.

    Default: only requests whose source_plan_id is genuinely eligible
    (open builder ticket + correct derived status — i.e., the plans
    get_eligible_plans returned). This prevents consuming stale
    plan-backed rows that have no live ticket (187 legacy-p* rows from
    the June/July era). With --include-legacy, all READY rows are
    returned (use with care).
    """
    if include_legacy:
        rows = db.get_requests_by_status("READY", limit=100)
    elif eligible_plan_ids:
        placeholders = ", ".join(["%s"] * len(eligible_plan_ids))
        with db._get_connection() as conn:
            cursor = conn.execute(
                f"""SELECT * FROM execution.requests
                    WHERE status = 'READY' AND source_plan_id IN ({placeholders})
                    ORDER BY created_at ASC
                    LIMIT 100""",
                tuple(eligible_plan_ids),
            )
            rows = cursor.dict_fetchall()
    else:
        rows = []
    return rows


def _reconcile_plans(db: DBAdapter) -> list[dict]:
    """Ensure every eligible builder plan has a READY execution request.

    Returns the READY requests created (or found) for those plans.
    """
    plans = db.get_eligible_plans(ROLE)
    created = []
    for plan in plans:
        plan_id = plan["id"]
        req = db.get_or_create_execution_request(
            plan_id=plan_id,
            title=plan.get("title", ""),
            objective=plan.get("goal", ""),
        )
        if req["status"] != "READY":
            with db._get_connection() as conn:
                conn.execute(
                    "UPDATE execution.requests SET status = 'READY', updated_at = NOW() "
                    "WHERE id = %s AND status != 'READY'",
                    (req["id"],),
                )
                conn.commit()
            _log.info("reconcile: plan %s → request %s READY", plan_id, req["id"])
            req["status"] = "READY"
        created.append(req)
    return created


def _build_req_from_request(db: DBAdapter, row: dict, model: str = "") -> dict | None:
    """Build a DCO-shaped req dict for executor_cloud from an execution request.

    Plan-backed → full DCO via WorkRequestFactory.create_from_plan.
    Non-plan → minimal req from the request row (legacy mode only).
    Returns None if the plan cannot be resolved.
    """
    plan_id = row.get("source_plan_id")
    if plan_id:
        plan = db.get_plan_by_id(plan_id)
        if not plan:
            _log.warning("request %s → plan %s not found; skipping", row["id"], plan_id)
            return None
        model_cfg = ModelConfig(harness="opencode", model=model)
        dco = WorkRequestFactory.create_from_plan(
            plan,
            role=ROLE,
            model_cfg=model_cfg,
            working_path=PROJECT_ROOT,
            session_id=row.get("_session_id", ""),
        )
        req = dco.model_dump(by_alias=True)
        req["_plan_id"] = plan_id
        return req

    # Legacy / non-plan request: minimal DCO-shaped dict
    req = {
        "id": row.get("business_key") or str(row["id"]),
        "path": PROJECT_ROOT,
        "objective": row.get("objective") or row.get("title") or "",
        "metadata": {
            "role": ROLE,
            "harness": "opencode",
            "model": model,
            "session_id": row.get("_session_id", ""),
            "tags": [],
        },
        "intent": {
            "problem_statement": row.get("objective") or "",
            "desired_outcome": row.get("title") or "",
        },
        "decomposition": {"strategy": "Direct execution", "steps": []},
        "requirements": {"functional": [], "non_functional": [], "system_requirements": [], "tool_requirements": []},
        "constraints": {"safety_constraints": [], "forbidden_actions": [], "resource_limits": None, "architectural_constraints": []},
        "success_criteria": {"completion_conditions": [], "validation_rules": [], "acceptance_tests": [], "failure_modes": []},
        "artifacts": {"produced_files": [], "intermediate_outputs": []},
        "lineage": {"derived_from": [], "supersedes": None, "branches": [], "merge_history": []},
    }
    return req


def _claim_conduit_ticket(db: DBAdapter, plan_id: str, session_id: str) -> str | None:
    """Claim the builder ticket on the plan (Invariant 1). Returns ticket_id or None."""
    try:
        ticket_id = db.claim_ticket(plan_id, ROLE, session_id)
    except Exception as e:  # noqa: BLE001
        _log.warning("claim_ticket failed plan=%s error=%s", plan_id, e)
        return None
    if ticket_id:
        _log_ok(f"ticket {ticket_id} claimed (plan {plan_id})")
    else:
        _log_warn(f"no open builder ticket for plan {plan_id} — continuing without ticket claim")
    return ticket_id


def _complete_conduit_lifecycle(
    db: DBAdapter,
    plan_id: str,
    session_id: str,
    ticket_id: str | None,
    wr_id: str,
    model: str,
    success: bool,
) -> None:
    """Replicate _dispatch_one's success/failure tail: receipt, close ticket,
    advance cursor, create next tickets (Invariant 5)."""
    if success:
        db.insert_receipt(
            plan_id=plan_id,
            receipt_type=SUCCESS_RECEIPT,
            agent_role=ROLE,
            session_id=session_id,
            ticket_id=ticket_id or "",
            summary=f"builder completed via {wr_id} (model={model})",
            metadata={"work_request_id": wr_id, "role": ROLE, "harness": "opencode",
                      "model": model, "executor": "execution-worker"},
        )
        if ticket_id:
            db.close_ticket(plan_id, ROLE, session_id, "completed")
        db.advance_cursor(ROLE, plan_id, wr_id)
        db.create_next_tickets(
            plan_id, ROLE, "completed",
            parent_ticket_id=ticket_id or "",
            objective=wr_id,
            completion_criteria="",
            owner=ROLE,
        )
        _log_ok(f"IMPLEMENTATION receipt + next tickets created (plan {plan_id})")
    else:
        db.insert_receipt(
            plan_id=plan_id,
            receipt_type=FAIL_RECEIPT,
            agent_role=ROLE,
            session_id=session_id,
            ticket_id=ticket_id or "",
            summary=f"builder failed via {wr_id} (model={model})",
            metadata={"work_request_id": wr_id, "role": ROLE, "harness": "opencode",
                      "model": model, "executor": "execution-worker"},
        )
        if ticket_id:
            db.close_ticket(plan_id, ROLE, session_id, "failed")
        db.advance_cursor(ROLE, plan_id, wr_id)
        _log_warn(f"BLOCK receipt recorded (plan {plan_id})")


def _process_one(db: DBAdapter, row: dict, executor_id: str, dry_run: bool, model: str = "") -> str:
    """Claim + execute one READY request. Returns outcome string."""
    request_id = row["id"]
    plan_id = row.get("source_plan_id")
    title = row.get("title", "")[:60]

    if dry_run:
        _log.info("DRY-RUN: would execute request %s (plan=%s title=%r)", request_id, plan_id, title)
        return "dry-run"

    # ── Lease (mutual exclusion, ADR-006) ──────────────────────────
    lease = db.acquire_lease(request_id=request_id, executor_id=executor_id, ttl_seconds=LEASE_TTL)
    if not lease:
        _log_warn(f"request {request_id} already leased — skipping")
        return "leased"

    lease_id = lease["id"]
    session_id = f"worker-{executor_id}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{os.urandom(4).hex()}"
    ticket_id = None
    attempt_id = None
    renewer_stop = threading.Event()

    def _renew_lease_loop():
        while not renewer_stop.wait(RENEW_INTERVAL):
            try:
                db.renew_lease(lease_id, LEASE_TTL)
            except Exception as e:  # noqa: BLE001
                _log.warning("lease renew failed: %s", e)

    renewer = threading.Thread(target=_renew_lease_loop, daemon=True)
    renewer.start()

    try:
        # ── Ticket (Invariant 1) — claim if plan-backed ─────────────
        if plan_id:
            db.create_session(session_id, ROLE, [plan_id])
            ticket_id = _claim_conduit_ticket(db, plan_id, session_id)

        # ── Attempt (ADR-006) ───────────────────────────────────────
        attempt = db.create_attempt(lease_id=lease_id, request_id=request_id, executor_id=executor_id)
        attempt_id = attempt["id"]
        db.start_attempt(attempt_id)
        _log.info("attempt %s started (request %s, plan %s)", attempt_id, request_id, plan_id)

        # ── Build req + launch real agent ───────────────────────────
        row["_session_id"] = session_id
        req = _build_req_from_request(db, row, model=model)
        if req is None:
            raise RuntimeError(f"cannot build req for request {request_id}")

        # ── Record the WR in vision.work_requests (idempotent) ──────
        # Mirrors _dispatch_one's add_work_request: gives plan 1284's
        # conformance trace a real WR row in the vision store.
        if plan_id:
            try:
                db.add_work_request(
                    req.get("id", ""), plan_id,
                    json.dumps(req, default=str),
                    title=title,
                )
            except Exception as e:  # noqa: BLE001
                _log.warning("add_work_request failed plan=%s error=%s", plan_id, e)

        session_log_path = os.path.join(
            os.environ.get("CONDUIT_DATA_DIR", os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                "audit", "CONDUIT_DATA")),
            "session_logs", f"{session_id}.log",
        )

        _log.info("launching opencode builder via executor_cloud.run_opencode …")
        result = executor_cloud.run_opencode(req, PROJECT_ROOT, session_log_path=session_log_path)
        _log.info("builder finished (chars=%d)", len(result or ""))

        # ── Success path ────────────────────────────────────────────
        db.complete_attempt(attempt_id, "SUCCEEDED", exit_code=0,
                            result={"work_request_id": req.get("id"), "model": req.get("metadata", {}).get("model", "")})
        db.issue_execution_receipt(
            attempt_id=attempt_id, request_id=request_id,
            receipt_type=SUCCESS_RECEIPT, agent_role=executor_id,
            summary=f"builder completed via {req.get('id')}",
            metadata={"work_request_id": req.get("id"), "executor": executor_id},
        )
        db.release_lease(lease_id)
        with db._get_connection() as conn:
            conn.execute("UPDATE execution.requests SET status = 'COMPLETED', updated_at = NOW() WHERE id = %s", (request_id,))
            conn.commit()
        _log_ok(f"request {request_id} COMPLETED")

        if plan_id:
            _complete_conduit_lifecycle(
                db, plan_id, session_id, ticket_id, req.get("id", ""),
                req.get("metadata", {}).get("model", ""), success=True,
            )
            # ── consumed_units tracking (RoleLeases plan 1286) ──────
            # Unified accounting: POST /api/role-leases/consume (canonical endpoint)
            try:
                _body = json.dumps({"role": ROLE}).encode()
                _req = urllib.request.Request(
                    "http://localhost:3101/api/role-leases/consume",
                    data=_body,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(_req, timeout=5):
                    pass
            except Exception as e:  # noqa: BLE001
                _log.warning("consumed_units update failed: %s", e)
        renewer_stop.set()
        return "completed"

    except Exception as e:  # noqa: BLE001
        _log.error("execution failed request=%s error=%s", request_id, e)
        renewer_stop.set()
        if attempt_id:
            db.complete_attempt(attempt_id, "FAILED", exit_code=1, error=str(e))
        if plan_id:
            db.insert_receipt(
                plan_id=plan_id, receipt_type="BLOCK", agent_role=ROLE,
                session_id=session_id, ticket_id=ticket_id or "",
                summary=f"execution_worker failure: {e}",
                metadata={"request_id": request_id, "executor": executor_id},
            )
            db.close_ticket(plan_id, ROLE, session_id, "failed")
            db.advance_cursor(ROLE, plan_id, str(request_id))
        try:
            db.release_lease(lease_id)
        except Exception:  # noqa: BLE001
            pass
        with db._get_connection() as conn:
            conn.execute("UPDATE execution.requests SET status = 'FAILED', updated_at = NOW() WHERE id = %s", (request_id,))
            conn.commit()
        _log_warn(f"request {request_id} FAILED")
        return "failed"


def _recover_orphans(db: DBAdapter) -> int:
    """Self-heal after a crashed run.

    - Expire stale ACTIVE leases (past TTL).
    - Release 'claimed' builder tickets whose session no longer has an
      active lease on the request (i.e., the worker died mid-run).

    Returns number of released tickets.
    """
    try:
        expired = db.expire_stale_leases()
        if expired:
            _log.info("recovered: expired %d stale lease(s)", expired)
    except Exception as e:  # noqa: BLE001
        _log.warning("expire_stale_leases failed: %s", e)

    released = 0
    try:
        with db._get_connection() as conn:
            # Claimed tickets where the claiming session has no ACTIVE lease
            # on the same request (orphaned by a killed worker).
            cursor = conn.execute(
                """SELECT t.id AS ticket_id, t.plan_id, t.session_id
                   FROM vision.tickets t
                   WHERE t.role = 'builder' AND t.status = 'claimed'
                     AND t.session_id IS NOT NULL
                     AND NOT EXISTS (
                         SELECT 1 FROM execution.leases l
                         JOIN execution.attempts a ON a.lease_id = l.id
                         WHERE a.executor_id = 'conduit-worker'
                           AND l.status = 'ACTIVE'
                           AND l.request_id IN (
                               SELECT id FROM execution.requests
                               WHERE source_plan_id = t.plan_id
                           )
                     )
                   LIMIT 20"""
            )
            rows = cursor.dict_fetchall()
            for row in rows:
                conn.execute(
                    "UPDATE vision.tickets SET status='open', session_id=NULL, "
                    "claimed_at=NULL, last_activity=NOW() WHERE id = %s AND status='claimed'",
                    (row["ticket_id"],),
                )
                released += 1
            conn.commit()
        if released:
            _log.info("recovered: released %d orphaned builder ticket(s)", released)
    except Exception as e:  # noqa: BLE001
        _log.warning("orphaned-ticket recovery failed: %s", e)
    return released


def _run_pass(db: DBAdapter, executor_id: str, dry_run: bool, include_legacy: bool, model: str = "") -> dict:
    """One full pass: recover + reconcile + consume. Returns summary."""
    summary = {"recovered": 0, "reconciled": 0, "consumed": 0, "skipped_leased": 0, "failed": 0, "dry_run": 0}

    # 0. Self-heal after a crashed run
    summary["recovered"] = _recover_orphans(db)

    # 1. Reconcile eligible plans → READY requests
    try:
        reconciled = _reconcile_plans(db)
        summary["reconciled"] = len(reconciled)
        if reconciled:
            _log.info("reconciled %d plan(s) into READY execution requests", len(reconciled))
    except Exception as e:  # noqa: BLE001
        _log.error("reconcile failed: %s", e)

    # 2. Eligible plan ids = plans with open builder ticket + correct derived status
    eligible_plan_ids = set()
    try:
        eligible = db.get_eligible_plans(ROLE)
        eligible_plan_ids = {p["id"] for p in eligible}
    except Exception as e:  # noqa: BLE001
        _log.error("eligible-plans query failed: %s", e)

    # 3. Consume READY requests
    rows = _list_ready(db, include_legacy, eligible_plan_ids)
    if rows:
        _log.info("found %d READY request(s)", len(rows))
    for row in rows:
        outcome = _process_one(db, row, executor_id, dry_run, model=model)
        if outcome == "completed":
            summary["consumed"] += 1
        elif outcome == "failed":
            summary["failed"] += 1
        elif outcome == "leased":
            summary["skipped_leased"] += 1
        elif outcome == "dry-run":
            summary["dry_run"] += 1

    return summary


def _show_status(db: DBAdapter) -> None:
    print("=== execution.requests status ===\n")
    for status in ("READY", "COMPLETED", "FAILED", "VALIDATED", "ADMITTED", "DRAFT"):
        try:
            rows = db.get_requests_by_status(status, limit=500)
        except Exception:  # noqa: BLE001
            continue
        plan_backed = sum(1 for r in rows if r.get("source_plan_id"))
        print(f"{status:<10} {len(rows):>5}  (plan-backed: {plan_backed})")
    print()
    print("=== eligible builder plans (reconcile would pick these up) ===")
    try:
        plans = db.get_eligible_plans(ROLE)
        if plans:
            for p in plans:
                print(f"  plan {p['id']}: {p.get('title', '')[:70]}")
        else:
            print("  (none)")
    except Exception as e:  # noqa: BLE001
        print(f"  error: {e}")
    print()
    print(f"model chain (tackle): {executor_cloud._resolve_model_name({'metadata': {'role': 'builder'}})}")


def main():
    parser = argparse.ArgumentParser(description="Conduit execution worker — consumes execution.requests READY")
    parser.add_argument("--status", action="store_true", help="Show READY backlog + eligible plans")
    parser.add_argument("--dry-run", action="store_true", help="Reconcile + report, do not launch agents")
    parser.add_argument("--once", action="store_true", help="Run a single pass")
    parser.add_argument("--loop", action="store_true", help="Run as daemon (default)")
    parser.add_argument("--interval", type=int, default=60, help="Poll interval seconds (default 60)")
    parser.add_argument("--executor-id", default="conduit-worker", help="Executor identity (default: conduit-worker)")
    parser.add_argument("--include-legacy", action="store_true", help="Also consume non-plan READY rows (default: plan-backed only)")
    parser.add_argument("--model", default=os.environ.get("PIPELINE_MODEL", ""),
                        help="Model override (e.g. ollama/qwen2.5-coder-ctx32k). "
                             "Takes precedence over the tackle role config; "
                             "defaults to $PIPELINE_MODEL.")
    args = parser.parse_args()

    db = DBAdapter("")

    if args.status:
        _show_status(db)
        return

    if args.dry_run:
        summary = _run_pass(db, args.executor_id, dry_run=True, include_legacy=args.include_legacy, model=args.model)
        print(f"\nDRY-RUN summary: {json.dumps(summary)}")
        return

    if args.once:
        summary = _run_pass(db, args.executor_id, dry_run=False, include_legacy=args.include_legacy, model=args.model)
        print(f"\nPass summary: {json.dumps(summary)}")
        return

    # Default: loop
    _log.info("execution worker starting (executor=%s, interval=%ds, include_legacy=%s, model=%s)",
              args.executor_id, args.interval, args.include_legacy, args.model or "(tackle config)")
    while True:
        try:
            summary = _run_pass(db, args.executor_id, dry_run=False, include_legacy=args.include_legacy, model=args.model)
            _log.info("pass summary: %s", json.dumps(summary))
        except Exception as e:  # noqa: BLE001
            _log.error("pass error: %s", e)
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
