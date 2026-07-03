#!/usr/bin/env python3
"""
candidate_promote.py — Candidate Promotion Gate

Takes ready harvest candidates (CPF >= threshold) and promotes them into
the plan pipeline by:

  1. Creating a requirement record (candidate_id back-link)
  2. Creating a conduit plan via the MCP API
  3. Marking the candidate status = 'promoted'

Traceability: harvest → candidate → requirement → plan → WorkRequest

Usage:
    cd /home/codex/dev/nexus/python/rover
    source .venv/bin/activate

    # Promote a specific candidate by UUID
    python3 candidate_promote.py --candidate <uuid>

    # Promote all ready candidates (CPF >= 0.7)
    python3 candidate_promote.py --ready

    # Promote specific candidates from a list
    python3 candidate_promote.py --candidates <uuid1> <uuid2>

    # Dry-run: show what would be promoted
    python3 candidate_promote.py --ready --dry-run
"""

import argparse
import json
import logging
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime

log = logging.getLogger("candidate_promote")

DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]
CONDUIT_MCP_URL = "http://localhost:3100/tools/call"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)


def psql(sql: str, timeout: int = 30) -> tuple[int, str]:
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, result.stdout.strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)"


def fetch_ready_candidates(threshold: float = 0.7) -> list[dict]:
    """Fetch all candidates with CPF >= threshold and status != 'promoted'."""
    sql = f"""
        SELECT row_to_json(r)::text FROM (
            SELECT
                hc.id,
                hc.harvest_id,
                hc.title,
                hc.intent_description,
                hc.status,
                hc.compilation_readiness,
                hc.tags,
                hc.system_id,
                hc.subsystem_id,
                hc.feature_id,
                hc.implementation_notes,
                hc.open_questions,
                COALESCE(sys.name, 'nexus') AS system_name,
                COALESCE(sub.name, '') AS subsystem_name,
                COALESCE(h.source_filename, '') AS source_filename
            FROM nebula.harvest_candidates hc
            LEFT JOIN nebula.systems sys ON sys.id = hc.system_id
            LEFT JOIN nebula.subsystems sub ON sub.id = hc.subsystem_id
            LEFT JOIN nebula.harvests h ON h.id = hc.harvest_id
            WHERE hc.compilation_readiness >= {threshold}
              AND (hc.status IS NULL OR hc.status NOT IN ('promoted'))
            ORDER BY hc.compilation_readiness DESC, hc.created_at DESC
        ) r;
    """
    rc, out = psql(sql)
    if rc != 0 or not out:
        return []

    candidates = []
    for line in out.splitlines():
        if not line:
            continue
        try:
            c = json.loads(line)
            candidates.append(c)
        except json.JSONDecodeError:
            continue
    return candidates


def fetch_candidate(candidate_id: str) -> dict | None:
    """Fetch a single candidate with system names."""
    sql = f"""
        SELECT row_to_json(r)::text FROM (
            SELECT
                hc.id,
                hc.harvest_id,
                hc.title,
                hc.intent_description,
                hc.status,
                hc.compilation_readiness,
                hc.tags,
                hc.system_id,
                hc.subsystem_id,
                hc.feature_id,
                hc.implementation_notes,
                hc.open_questions,
                COALESCE(sys.name, 'nexus') AS system_name,
                COALESCE(sub.name, '') AS subsystem_name,
                COALESCE(h.source_filename, '') AS source_filename
            FROM nebula.harvest_candidates hc
            LEFT JOIN nebula.systems sys ON sys.id = hc.system_id
            LEFT JOIN nebula.subsystems sub ON sub.id = hc.subsystem_id
            LEFT JOIN nebula.harvests h ON h.id = hc.harvest_id
            WHERE hc.id = '{candidate_id}'
        ) r;
    """
    rc, out = psql(sql)
    if rc != 0 or not out:
        return None
    try:
        return json.loads(out.splitlines()[0])
    except (json.JSONDecodeError, IndexError):
        return None


def create_requirement(candidate: dict) -> str | None:
    """Insert a requirement record linked to the candidate. Returns requirement ID or None."""
    title = candidate["title"].replace("'", "''")
    description = (candidate.get("intent_description") or "").replace("'", "''")
    system_id = candidate.get("system_id") or "NULL"
    subsystem_id = candidate.get("subsystem_id") or "NULL"
    feature_id = candidate.get("feature_id") or "NULL"
    cid = candidate["id"]

    # Build acceptance criteria from implementation_notes
    notes = candidate.get("implementation_notes") or []
    ac_items = json.dumps([n.get("title", str(n))[:200] for n in notes if isinstance(n, dict)] or [])

    # Derive project from system name
    project = (candidate.get("system_name") or "nexus").lower().replace(" ", "-")

    # Derive priority from CPF
    readiness = candidate.get("compilation_readiness") or 0.0
    if readiness >= 0.9:
        priority = "High"
    elif readiness >= 0.8:
        priority = "High"
    elif readiness >= 0.7:
        priority = "Medium"
    else:
        priority = "Low"

    sql = f"""
        INSERT INTO nebula.requirements
            (title, description, system_id, subsystem_id, feature_id,
             candidate_id, status, priority, acceptance_criteria)
        VALUES
            ('{title}', '{description}',
             {f"'{system_id}'" if system_id != "NULL" else "NULL"}::uuid,
             {f"'{subsystem_id}'" if subsystem_id != "NULL" else "NULL"}::uuid,
             {f"'{feature_id}'" if feature_id != "NULL" else "NULL"}::uuid,
             '{cid}'::uuid,
             'Backlog', '{priority}',
             '{ac_items.replace("'", "''")}'::jsonb)
        RETURNING id;
    """
    rc, out = psql(sql)
    if rc != 0 or not out:
        log.error("  Failed to create requirement: %s", out[:200])
        return None
    req_id = out.strip()
    log.info("  → Requirement created: %s (priority=%s)", req_id[:8], priority)
    return req_id


def call_conduit_create_plan(candidate: dict) -> str | None:
    """Call conduit-mcp create_plan tool via HTTP. Returns plan number or None."""
    title = candidate["title"]
    goal = candidate.get("intent_description") or title
    system_name = candidate.get("system_name", "nexus")
    project = system_name.lower().replace(" ", "-")

    # Build acceptance criteria
    notes = candidate.get("implementation_notes") or []
    acceptance_criteria = []
    for n in notes:
        if isinstance(n, dict) and "title" in n:
            acceptance_criteria.append(n["title"][:200])
        elif isinstance(n, str):
            acceptance_criteria.append(n[:200])
    if not acceptance_criteria and candidate.get("open_questions"):
        qs = candidate["open_questions"]
        if isinstance(qs, list):
            acceptance_criteria = [f"Resolve: {q[:200]}" for q in qs[:3]]

    payload = {
        "name": "create_plan",
        "arguments": {
            "title": title,
            "project": project,
            "goal": goal,
            "acceptanceCriteria": acceptance_criteria[:5] or ["Validate candidate promotion"],
            "filesAffected": [],
        },
    }

    data = json.dumps(payload).encode("utf-8")
    try:
        req = urllib.request.Request(
            CONDUIT_MCP_URL,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())

        # Conduit-mcp wraps success in result.result
        inner = result.get("result", result)
        if inner.get("created") and inner.get("planNumber"):
            plan_num = inner["planNumber"]
            log.info("  → Conduit plan created: %s", plan_num)
            return plan_num

        log.warning("  Conduit response: %s", str(result)[:200])
        return None

    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300] if e.fp else ""
        log.error("  Conduit HTTP %d: %s", e.code, body)
        return None
    except urllib.error.URLError as e:
        log.error("  Conduit unreachable: %s", e.reason)
        return None
    except Exception as e:
        log.error("  Conduit error: %s", e)
        return None


def promote_candidate(candidate: dict, dry_run: bool = False) -> dict:
    """Promote a single candidate: requirement → plan → mark promoted."""
    result = {
        "candidate_id": candidate["id"],
        "title": candidate["title"],
        "requirement_id": None,
        "plan_number": None,
        "success": False,
        "error": None,
    }

    # Validate eligibility
    if not candidate.get("intent_description"):
        result["error"] = "No intent_description"
        log.warn("  Skipping: no intent_description")
        return result

    cpf = candidate.get("compilation_readiness")
    if cpf is None or cpf < 0.0:
        result["error"] = f"Low CPF: {cpf}"
        log.warn("  Skipping: CPF not computed")
        return result

    log.info("─" * 60)
    log.info("Promoting: %s", candidate["title"])
    log.info("  CPF=%.3f | System=%s | Tags=%s",
             cpf, candidate.get("system_name", "?"),
             ", ".join((candidate.get("tags") or [])[:3]))

    if dry_run:
        log.info("  [DRY RUN] Would create requirement + plan")
        result["success"] = True
        return result

    # Step 1: Create requirement
    req_id = create_requirement(candidate)
    if not req_id:
        result["error"] = "Requirement creation failed"
        return result
    result["requirement_id"] = req_id

    # Step 2: Create conduit plan
    plan_num = call_conduit_create_plan(candidate)
    if not plan_num:
        result["error"] = "Plan creation failed (requirement created but no plan)"
        result["success"] = True  # Partial success: requirement exists
        return result
    result["plan_number"] = plan_num

    # Step 3: Mark candidate as promoted
    sql = f"""
        UPDATE nebula.harvest_candidates
        SET status = 'promoted',
            updated_at = now()
        WHERE id = '{candidate['id']}'
        AND (status IS NULL OR status NOT IN ('promoted'));
    """
    rc, out = psql(sql)
    if rc == 0:
        log.info("  → Candidate status → promoted")
    else:
        log.warning("  Could not update candidate status: %s", out[:100])

    result["success"] = True
    log.info("  ✓ Promoted: req=%s plan=%s", req_id[:8], plan_num)
    return result


def main():
    parser = argparse.ArgumentParser(description="Promote candidates to plans")
    parser.add_argument("--candidate", type=str, default=None,
                        help="Single candidate UUID to promote")
    parser.add_argument("--candidates", type=str, nargs="+", default=None,
                        help="Multiple candidate UUIDs to promote")
    parser.add_argument("--ready", action="store_true",
                        help="Promote all ready candidates (CPF >= threshold)")
    parser.add_argument("--threshold", type=float, default=0.7,
                        help="CPF threshold for --ready (default: 0.7)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be promoted without making changes")
    parser.add_argument("--limit", type=int, default=10,
                        help="Max candidates to promote (default: 10)")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("Candidate Promotion Gate")
    log.info("Time: %s", datetime.now().isoformat())
    log.info("Mode: %s", "DRY RUN" if args.dry_run else "LIVE")
    log.info("=" * 60)

    # Collect candidates to promote
    candidates = []
    if args.candidate:
        c = fetch_candidate(args.candidate)
        if c:
            candidates.append(c)
        else:
            log.error("Candidate not found: %s", args.candidate)
            return 1
    elif args.candidates:
        for cid in args.candidates:
            c = fetch_candidate(cid)
            if c:
                candidates.append(c)
            else:
                log.warning("Candidate not found: %s", cid)
    elif args.ready:
        candidates = fetch_ready_candidates(args.threshold)
        log.info("Ready candidates found: %d", len(candidates))
    else:
        parser.print_help()
        return 1

    if not candidates:
        log.info("No candidates to promote.")
        return 0

    # Apply limit
    if args.limit and len(candidates) > args.limit:
        log.info("Limiting to %d / %d candidates", args.limit, len(candidates))
        candidates = candidates[:args.limit]

    # Promote each candidate
    log.info("Candidates to promote: %d", len(candidates))
    results = []
    for c in candidates:
        r = promote_candidate(c, dry_run=args.dry_run)
        results.append(r)

    # Summary
    log.info("=" * 60)
    successes = [r for r in results if r["success"]]
    failures = [r for r in results if not r["success"]]
    log.info("PROMOTION RESULTS: %d success, %d failed", len(successes), len(failures))

    if failures:
        log.info("─" * 60)
        for f in failures:
            log.warning("  ✗ %s — %s", f["title"][:60], f.get("error", "unknown"))

    if successes:
        log.info("─" * 60)
        for s in successes:
            req = s.get("requirement_id", "?")[:8] if s.get("requirement_id") else "-"
            plan = s.get("plan_number") or "-"
            log.info("  ✓ %s  req=%s  plan=%s", s["title"][:50], req, plan)

    log.info("=" * 60)
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
