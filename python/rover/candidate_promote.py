#!/usr/bin/env python3
"""
candidate_promote.py — Candidate → IntentRecord Promotion Gate

Takes ready harvest candidates (CPF >= threshold) and promotes them into
the pipeline by:

  1. Creating an intent_record (lightweight pre-canonical intent capture)
     linked back to the harvest candidate
  2. Marking the candidate status = 'promoted'

This replaces the old flow that incorrectly created conduit implementation
plans from raw intents. IntentRecords live in the cognitive/pre-canonical
layer — they can later be decomposed into requirements, specs, and
implementation plans.

Traceability: harvest → candidate → intent_record → requirements → ...

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
import uuid as uuidlib
from datetime import datetime

log = logging.getLogger("candidate_promote")

DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]

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


def create_intent_record(candidate: dict) -> str | None:
    """Create an intent_record linked to this candidate.

    IntentRecords sit at the cognitive/pre-canonical layer. They are
    lightweight, mutable, and capture raw intent. They can later be
    decomposed into requirements.

    Returns the intent_record UUID or None on failure.
    """
    record_id = str(uuidlib.uuid4())
    title = candidate["title"].replace("'", "''")
    description = (candidate.get("intent_description") or "").replace("'", "''")
    cid = candidate["id"]

    # Build tags from candidate tags + source marker
    tags = candidate.get("tags") or []
    tags_json = json.dumps(list(tags) + ["promoted-from-candidate"]).replace("'", "''")

    now = datetime.utcnow().isoformat() + "Z"

    sql = f"""
        INSERT INTO nebula.intent_records
            (id, candidate_id, title, description,
             source_type, source_ref, tags, status, metadata,
             created_at, updated_at)
        VALUES
            ('{record_id}'::uuid, '{cid}'::uuid,
             '{title}', '{description}',
             'candidate', '{cid}',
             '{tags_json}'::text[],
             'draft',
             '{{"cpf": {candidate.get("compilation_readiness", 0.0)}}}'::jsonb,
             '{now}', '{now}')
        RETURNING id;
    """
    rc, out = psql(sql)
    if rc != 0 or not out:
        log.error("  Failed to create intent_record: %s", out[:200])
        return None

    ir_id = out.strip()
    log.info("  → IntentRecord created: %s (from candidate %s)", ir_id[:8], cid[:8])
    return ir_id


def promote_candidate(candidate: dict, dry_run: bool = False) -> dict:
    """Promote a single candidate: create intent_record → mark promoted."""
    result = {
        "candidate_id": candidate["id"],
        "title": candidate["title"],
        "intent_record_id": None,
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
        log.info("  [DRY RUN] Would create intent_record")
        result["success"] = True
        return result

    # Step 1: Create intent_record (replaces old requirement + conduit plan creation)
    ir_id = create_intent_record(candidate)
    if not ir_id:
        result["error"] = "IntentRecord creation failed"
        return result
    result["intent_record_id"] = ir_id

    # Step 2: Mark candidate as promoted
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
    log.info("  ✓ Promoted: intent_record=%s", ir_id[:8])
    return result


def main():
    parser = argparse.ArgumentParser(description="Promote candidates to IntentRecords")
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
    log.info("Candidate → IntentRecord Promotion Gate")
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
            ir = s.get("intent_record_id", "?")[:8] if s.get("intent_record_id") else "-"
            log.info("  ✓ %s  intent_record=%s", s["title"][:50], ir)

    log.info("=" * 60)
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
