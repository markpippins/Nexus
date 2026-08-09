#!/usr/bin/env python3
"""pipeline-health-sweep.py — automated pipeline health sweep.

Runs the four pipeline-health checks — the three DB queries from the
`pipeline-health-check` procedure card (blocked plans, plan-status drift,
flagged changes) plus the projection-vs-replay drift scan via conduit-srv
`GET /wr/drift-scan` (plan 1285) — and posts findings to the Assembly
`drift-reports` forum, replacing the manual turn-start checks.

Canonical scheduling: systemd user timer `nexus-pipeline-health.timer`
(every 30 min). State (last-posted signature) lives in a local cache file so
repeat runs with unchanged findings do not spam the forum; a new thread is
posted when the finding set changes, and a short resolution thread when it
clears.

Usage:
  pipeline-health-sweep.py                 # run + post (only when findings change)
  pipeline-health-sweep.py --dry-run       # print report, never post/update state
  pipeline-health-sweep.py --force         # post even if signature unchanged
  pipeline-health-sweep.py --quiet         # suppress report output (cron mode)

Options:
  --forum SLUG       Assembly forum to post to (default: drift-reports)
  --role NAME        Role attribution (default: inspector)
  --model ID         Model attribution (default: automated/nexus-pipeline-health-sweep)
  --assembly-url URL Assembly API base (default: http://localhost:3107)
  --state PATH       State file (default: ~/.cache/nexus-pipeline-health-state.json)
  --conduit-url URL  conduit-srv base for the projection-drift scan
                     (default: http://localhost:3104)
  --dry-run          Print report only; do not post, do not touch state
  --force            Post even when the finding signature is unchanged
  --quiet            Suppress the report on stdout
  -h, --help         Show this help

Exit codes: 0 ok (findings may exist), 1 error (DB/API failure).
"""

import argparse
import hashlib
import json
import os
import sys

import psycopg2

# ── config ────────────────────────────────────────────────────────────
DEFAULT_ASSEMBLY_URL = "http://localhost:3107"
DEFAULT_ROLE = "inspector"
DEFAULT_MODEL = "automated/nexus-pipeline-health-sweep"
DEFAULT_FORUM = "drift-reports"
DEFAULT_STATE = os.path.expanduser("~/.cache/nexus-pipeline-health-state.json")
DEFAULT_CONDUIT_URL = "http://localhost:3104"

DB = dict(
    host=os.environ.get("PGHOST", "localhost"),
    port=int(os.environ.get("PGPORT", "5432")),
    user=os.environ.get("PGUSER", "pguser"),
    password=os.environ.get("PGPASSWORD", "pgpass"),
    dbname=os.environ.get("PGDATABASE", "nexus"),
)

# ── the three health checks (mirrors pipeline-health-check card v2) ────
QUERY_BLOCKED = """
WITH latest AS (
  SELECT DISTINCT ON (plan_id) plan_id, type, created_at
  FROM vision.receipts WHERE plan_id ~ '^[0-9]+$'
  ORDER BY plan_id, created_at DESC)
SELECT plan_id, type, to_char(created_at, 'YYYY-MM-DD') AS since
FROM latest WHERE type IN ('BLOCK','HOLD') ORDER BY created_at
"""

QUERY_DRIFT = """
WITH latest AS (
  SELECT DISTINCT ON (plan_id) plan_id, type, created_at
  FROM vision.receipts WHERE plan_id ~ '^[0-9]+$'
  ORDER BY plan_id, created_at DESC),
stuck AS (
  SELECT plan_id, created_at FROM latest
  WHERE type = 'PLAN_CREATE' AND created_at < NOW() - INTERVAL '24 hours')
SELECT s.plan_id, to_char(s.created_at,'YYYY-MM-DD') AS last_plan_create,
  (SELECT count(*) FROM vision.tickets t
    WHERE t.plan_id = s.plan_id AND (t.status = 'expired'
      OR (t.status IN ('open','claimed','stale')
          AND t.expires_at IS NOT NULL AND t.expires_at < NOW()))) AS expired_tickets,
  (SELECT count(*) FROM vision.tickets t
    WHERE t.plan_id = s.plan_id AND t.status = 'cancelled') AS cancelled_tickets,
  (SELECT count(*) FROM nebula.agent_records ar
    WHERE (ar.plan_ref = s.plan_id
       OR ar.content ~* ('(^|[^0-9])' || s.plan_id || '([^0-9]|$)'))
      AND ar.record_type IN ('report','inspection','engineering_log','assessment','analysis','decision')
      AND COALESCE(ar.title,'') NOT ILIKE '%pre-fk-snapshot%'
      AND COALESCE(ar.title,'') NOT ILIKE '%drift%'
      AND COALESCE(ar.title,'') NOT ILIKE '%ghost%'
      AND COALESCE(ar.title,'') NOT ILIKE '%cross-reference%'
      AND COALESCE(ar.title,'') NOT ILIKE 'CROSS REFERENCES%') AS evidence_rows
FROM stuck s ORDER BY s.created_at
"""

QUERY_FLAGGED = """
SELECT record_type, role, left(title,70) AS title, to_char(created_at,'YYYY-MM-DD HH24:MI') AS created
FROM nebula.agent_records
WHERE (tags && ARRAY['type:rejection','type:violation','type:incident'])
   OR record_type = 'inspection'
ORDER BY created_at DESC LIMIT 20
"""


def run_checks(cur):
    """Return dict of DB findings: blocked/drift/flagged rows.
    Projection drift is fetched separately (HTTP) — see fetch_projection_drift."""
    cur.execute(QUERY_BLOCKED)
    blocked = cur.fetchall()
    cur.execute(QUERY_DRIFT)
    drift = cur.fetchall()
    cur.execute(QUERY_FLAGGED)
    flagged = cur.fetchall()
    return {"blocked": blocked, "drift": drift, "flagged": flagged}


def fetch_projection_drift(conduit_url):
    """Query conduit-srv `GET /wr/drift-scan` (plan 1285) for projection-vs-replay
    drift across active work requests.

    Returns the findings list, or None when conduit-srv is unreachable so the
    sweep still reports the DB checks (and does not fail the run).
    """
    import urllib.request
    try:
        with urllib.request.urlopen(
            f"{conduit_url}/wr/drift-scan?limit=200", timeout=10
        ) as resp:
            data = json.loads(resp.read())
    except Exception as e:  # noqa: BLE001
        print(
            f"WARN: projection-drift scan unavailable (conduit-srv {conduit_url}): {e}",
            file=sys.stderr,
        )
        return None
    if not data.get("ok"):
        print(f"WARN: drift-scan returned ok=false: {data}", file=sys.stderr)
        return None
    return data.get("findings", [])


def signature(findings):
    """Stable signature of the finding set (plan/record ids) for dedup."""
    items = []
    for row in findings["blocked"]:
        items.append(f"blocked|{row[0]}")
    # include the signal columns so evidence/ticket-state changes re-post
    for row in findings["drift"]:
        items.append(f"drift|{row[0]}|{row[2]}|{row[3]}|{row[4]}")
    for row in findings["flagged"]:
        items.append(f"flagged|{row[2]}|{row[3]}")  # title|created
    # projection drift (work_request_uuid + state signals so fixes re-post)
    for f in findings.get("projection") or []:
        items.append(
            f"projection|{f.get('work_request_uuid')}|{f.get('status')}|"
            f"{f.get('expected_state')}|{f.get('live_state')}|"
            f"{f.get('expected_vision_ir_version')}|{f.get('live_vision_ir_version')}"
        )
    items.sort()
    return hashlib.sha256("\n".join(items).encode()).hexdigest()[:16]


def build_report(findings, role, model):
    """Markdown report body."""
    blocked, drift, flagged = findings["blocked"], findings["drift"], findings["flagged"]
    projection = findings.get("projection") or []
    proj_unavailable = findings.get("projection") is None
    lines = [
        "# Pipeline Health Sweep (automated)",
        "",
        f"**Role:** {role} ({model})  \n"
        f"**Source:** `nexus/bin/pipeline-health-sweep.py` — systemd timer `nexus-pipeline-health.timer` (every 30 min).",
        "",
        "DB checks mirror the `pipeline-health-check` procedure card (drift v2: cancelled-ticket signal, noise-excluded evidence); projection drift comes from conduit-srv `GET /wr/drift-scan` (plan 1285).",
        "",
    ]
    lines.append("## 1. Blocked plans (latest receipt BLOCK/HOLD)")
    if blocked:
        lines += [
            "",
            "| plan_id | type | since |",
            "|---|---|---|",
        ]
        for pid, typ, since in blocked:
            lines.append(f"| {pid} | {typ} | {since} |")
        lines.append("")
        lines.append(f"**{len(blocked)} blocked.** NOTE: older BLOCK/HOLD receipts may be stale markers on already-cancelled/archived ghost plans — confirm before dispatching.")
    else:
        lines.append("\nNone.")
    lines.append("")

    lines.append("## 2. Plan-status drift (stuck pending + expired/cancelled ticket + evidence)")
    if drift:
        lines += [
            "",
            "| plan_id | last_plan_create | expired | cancelled | evidence |",
            "|---|---|---|---|---|",
        ]
        for pid, since, exp, canc, ev in drift:
            lines.append(f"| {pid} | {since} | {exp} | {canc} | {ev} |")
        lines.append("")
        lines.append("**Remediation:** evidence>0 → implemented-but-pending: close via IMPLEMENTATION + REVIEW_PASS. cancelled>0/expired>0 with no evidence → abandoned: close via CANCELLED receipt (`POST /api/receipts/`), or re-arm ticket if genuinely wanted. Heuristic — confirm each manually.")
    else:
        lines.append("\nNone — no plan has been stuck-pending (PLAN_CREATE) >24h.")
    lines.append("")

    lines.append("## 3. Flagged changes / blocker reports")
    if flagged:
        lines += [
            "",
            "| record_type | role | title | created |",
            "|---|---|---|---|",
        ]
        for rtype, role_, title, created in flagged:
            lines.append(f"| {rtype} | {role_} | {title} | {created} |")
        lines.append("")
        lines.append("**Latest 20** (older flagged records exist; tail the query for more).")
    else:
        lines.append("\nNone.")
    lines.append("")

    lines.append("## 4. Projection drift (event replay vs live work_request_state)")
    if proj_unavailable:
        lines.append("\n**Scan unavailable** — conduit-srv `/wr/drift-scan` unreachable on this run; projection check skipped (the 3 DB checks above are still reported).")
    elif projection:
        lines += [
            "",
            "| wr_id | status | expected_state | live_state | ir_exp | ir_live |",
            "|---|---|---|---|---|---|",
        ]
        for f in projection:
            lines.append(
                f"| {f.get('wr_id') or '-'} | {f.get('status')} | "
                f"{f.get('expected_state')} | {f.get('live_state') or '—(missing projection)'} | "
                f"{f.get('expected_vision_ir_version')} | {f.get('live_vision_ir_version') or '—'} |"
            )
        lines.append("")
        lines.append("**Remediation:** live projection row missing or stale vs event replay. Non-destructive check (`conduit.check_projection_drift()`); backfill `conduit.work_request_state` via projector/replay, or archive the WR if it is a stale test artifact. Detail: `GET /wr/:id/projection-drift` on conduit-srv (3104).")
    else:
        lines.append("\nNone — active work-request projections match event replay.")
    lines.append("")
    lines.append("---")
    lines.append("_Automated sweep — generated by `nexus-pipeline-health.timer`. Findings post only when the finding set changes; replies to triage below._")
    return "\n".join(lines)


def resolve_user_uuid(assembly_url, role):
    import urllib.request
    us = json.load(urllib.request.urlopen(f"{assembly_url}/api/users", timeout=10))
    uid = next((u["id"] for u in us if str(u.get("name", "")).lower() == role.lower()), "")
    if not uid:
        raise RuntimeError(f"could not resolve Assembly user UUID for role '{role}'")
    return uid


def post_thread(assembly_url, forum, title, body, role, model):
    import urllib.request
    uid = resolve_user_uuid(assembly_url, role)
    payload = {
        "title": title,
        "body": body,
        "postedById": uid,
        "role": role,
        "model": model,
    }
    req = urllib.request.Request(
        f"{assembly_url}/api/forums/{forum}/threads",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def load_state(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {"signature": None, "threadId": None, "postedAt": None}


def save_state(path, state):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("--forum", default=DEFAULT_FORUM)
    ap.add_argument("--role", default=DEFAULT_ROLE)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--assembly-url", default=DEFAULT_ASSEMBLY_URL)
    ap.add_argument("--state", default=DEFAULT_STATE)
    ap.add_argument("--conduit-url", default=DEFAULT_CONDUIT_URL)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("-h", "--help", action="store_true")
    args = ap.parse_args()

    if args.help:
        print(__doc__)
        return 0

    try:
        conn = psycopg2.connect(**DB)
        cur = conn.cursor()
        findings = run_checks(cur)
        cur.close()
        conn.close()
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: health check query failed: {e}", file=sys.stderr)
        return 1

    # 4th check: projection-vs-replay drift via conduit-srv HTTP (plan 1285).
    # Returns None (skipped) when conduit-srv is unreachable — sweep continues.
    findings["projection"] = fetch_projection_drift(args.conduit_url)

    sig = signature(findings)
    total = sum(len(v) for v in findings.values() if v is not None)

    if args.dry_run:
        print(build_report(findings, args.role, args.model))
        print(f"\n[dry-run] findings={total} signature={sig} — no post, state untouched")
        return 0

    state = load_state(args.state)
    prev_sig = state.get("signature")
    now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()

    if total == 0:
        # Nothing wrong now. If we previously reported findings, post a short
        # resolution so the thread trail shows closure. The resolution post is
        # independent of --quiet (it is the audit trail, not status chatter).
        if prev_sig:
            try:
                proj_txt = (
                    "0 projection drift"
                    if findings.get("projection") is not None
                    else "projection scan unavailable (conduit-srv down)"
                )
                post_thread(
                    args.assembly_url, args.forum,
                    f"Pipeline health RESOLVED ({now[:10]})",
                    f"Automated sweep: all pipeline health checks are clean "
                    f"(0 blocked, 0 drift, 0 flagged, {proj_txt}).",
                    args.role, args.model,
                )
                if not args.quiet:
                    print("posted resolution thread (all clear)")
            except Exception as e:  # noqa: BLE001
                # keep state so the resolution is retried next run
                print(f"WARN: resolution post failed: {e}", file=sys.stderr)
                return 1
        save_state(args.state, {"signature": None, "threadId": None, "postedAt": now})
        if not args.quiet:
            print("health sweep: all clear (0 findings)")
        return 0

    # Findings exist.
    if prev_sig == sig and not args.force:
        if not args.quiet:
            print(f"health sweep: {total} findings, signature unchanged ({sig}) — no post")
        return 0

    proj = len(findings.get("projection") or [])
    proj_label = "n/a" if findings.get("projection") is None else str(proj)
    title = (
        f"Pipeline health: {total} finding(s) — blocked {len(findings['blocked'])}, "
        f"drift {len(findings['drift'])}, flagged {len(findings['flagged'])}, "
        f"projection {proj_label} ({now[:10]})"
    )
    try:
        thread = post_thread(
            args.assembly_url, args.forum, title,
            build_report(findings, args.role, args.model),
            args.role, args.model,
        )
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: forum post failed: {e}", file=sys.stderr)
        return 1

    save_state(args.state, {"signature": sig, "threadId": thread.get("id"), "postedAt": now})
    if not args.quiet:
        print(f"posted findings thread {thread.get('id')} ({total} findings)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
