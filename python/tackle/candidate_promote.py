#!/usr/bin/env python3
"""
candidate_promote.py — Candidate Promotion Gate

Takes ready harvest candidates (CPF >= threshold) and promotes them into
the pipeline by marking them as 'promoted'. The candidate then awaits
downstream processing (requirement creation, agenda matching, etc.).

V115 removed nebula.intent_records. Promotion no longer creates an
intermediate intent_record — candidates are linked directly to the
pipeline via their existing harvest_candidate rows.

Traceability: harvest → candidate (promoted) → requirements → ...

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate

    # Promote a specific candidate by UUID
    python3 python/tackle/candidate_promote.py --candidate <uuid>

    # Promote all ready candidates (CPF >= 0.7)
    python3 python/tackle/candidate_promote.py --ready

    # Promote specific candidates from a list
    python3 python/tackle/candidate_promote.py --candidates <uuid1> <uuid2>

    # Dry-run: show what would be promoted
    python3 python/tackle/candidate_promote.py --ready --dry-run
"""

import argparse
import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timezone

# Ensure parent dir (python/) is on path so rover.* and tackle.* are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from rover.event_emitter import emit_candidate_promoted

log = logging.getLogger("candidate_promote")

DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus", "-q"]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)


def psql(sql: str, timeout: int = 30) -> tuple[int, str, str]:
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)", ""


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
    rc, out, err = psql(sql)
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
    rc, out, err = psql(sql)
    if rc != 0 or not out:
        return None
    try:
        return json.loads(out.splitlines()[0])
    except (json.JSONDecodeError, IndexError):
        return None


def check_candidate_dedup(title: str, threshold: float = 0.6) -> dict | None:
    """Check if a candidate title duplicates an existing implementation_plan
    (trigram similarity).

    Returns a dict with match info if duplicate, None if clean.
    Uses psql() (docker exec) consistent with the rest of this script.
    """
    if not title:
        return None

    escaped = title.replace("'", "''")

    # Check implementation_plans (V115 removed intent_records)
    sql = f"""
        SELECT plan_number, title, similarity(title, '{escaped}') AS score
        FROM nebula.implementation_plans
        WHERE similarity(title, '{escaped}') > {threshold}
        ORDER BY score DESC LIMIT 1;
    """
    rc, out, _ = psql(sql)
    if rc == 0 and out:
        parts = out.split("|")
        if len(parts) >= 3:
            return {
                "source": "implementation_plan",
                "id": parts[0].strip(),
                "title": parts[1].strip(),
                "score": float(parts[2].strip()),
            }

    return None


def promote_candidate(candidate: dict, dry_run: bool = False) -> dict:
    """Promote a single candidate: mark as promoted in the database.

    V115 removed intent_records. Promotion now just marks the candidate
    status = 'promoted'. Downstream processing (requirement creation,
    agenda matching) happens separately.
    """
    result = {
        "candidate_id": candidate["id"],
        "title": candidate["title"],
        "success": False,
        "error": None,
    }

    # Validate eligibility
    if not candidate.get("intent_description"):
        result["error"] = "No intent_description"
        log.warning("  Skipping: no intent_description")
        return result

    cpf = candidate.get("compilation_readiness")
    if cpf is None or cpf < 0.0:
        result["error"] = f"Low CPF: {cpf}"
        log.warning("  Skipping: CPF not computed")
        return result

    # Deduplication gate: check against implementation_plans
    dedup_match = check_candidate_dedup(candidate["title"], threshold=0.6)
    if dedup_match:
        result["error"] = f"Duplicate of {dedup_match['source']}:{dedup_match['id']} (score={dedup_match['score']:.2f})"
        result["duplicate_of"] = dedup_match
        log.info("  Skipped (dedup): matches %s '%s' (score=%.2f)",
                 dedup_match["source"], dedup_match["title"][:50], dedup_match["score"])
        return result

    log.info("-" * 60)
    log.info("Promoting: %s", candidate["title"])
    log.info("  CPF=%.3f | System=%s | Tags=%s",
             cpf, candidate.get("system_name", "?"),
             ", ".join((candidate.get("tags") or [])[:3]))

    if dry_run:
        log.info("  [DRY RUN] Would mark candidate as promoted")
        result["success"] = True
        return result

    # Mark candidate as promoted
    sql = f"""
        UPDATE nebula.harvest_candidates
        SET status = 'promoted',
            updated_at = now()
        WHERE id = '{candidate['id']}'
        AND (status IS NULL OR status NOT IN ('promoted'));
    """
    rc, out, err = psql(sql)
    if rc == 0:
        log.info("  Candidate status -> promoted")

        # Cascade event: candidate.promoted
        emit_candidate_promoted(
            candidate_id=candidate["id"],
            intent_record_id=None,
            from_state=candidate.get("status", "unknown"),
            cpf=candidate.get("compilation_readiness"),
            source="rover.candidate_promote",
        )
    else:
        details = err[:100] if err else out[:100]
        log.warning("  Could not update candidate status: %s", details)

    result["success"] = True
    log.info("  Promoted: %s", candidate["id"][:8])
    return result


def main():
    parser = argparse.ArgumentParser(description="Promote candidates")
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
    failures = [r for r in results if not r["success"] and not r.get("duplicate_of")]
    dedup_skips = [r for r in results if r.get("duplicate_of")]
    log.info("PROMOTION RESULTS: %d success, %d dedup-skipped, %d failed",
             len(successes), len(dedup_skips), len(failures))

    if dedup_skips:
        log.info("-" * 60)
        log.info("Dedup skipped (%d):", len(dedup_skips))
        for d in dedup_skips:
            dup = d.get("duplicate_of", {})
            log.info("  %s -> %s:%s (score=%.2f)",
                     d["title"][:45], dup.get("source", "?"), dup.get("id", "?")[:8],
                     dup.get("score", 0))

    if failures:
        log.info("-" * 60)
        for f in failures:
            log.warning("  %s -- %s", f["title"][:60], f.get("error", "unknown"))

    if successes:
        log.info("-" * 60)
        for s in successes:
            log.info("  %s", s["title"][:50])

    log.info("=" * 60)
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
