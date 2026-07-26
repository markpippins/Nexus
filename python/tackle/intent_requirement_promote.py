#!/usr/bin/env python3
"""
intent_requirement_promote.py — IntentRecord → Requirement Promotion Gate

Takes draft IntentRecords and promotes them to requirements in the backlog,
where they await human-in-the-loop triage (drag to todo → triggers inference).

Promotion criteria (all must pass):
  1. CPF >= threshold (default 0.7) OR candidate has code snippets
  2. No blocking open_questions for the candidate
  3. IntentRecord is in 'draft' status

Non-blocking: questions with blocking=false are ignored.

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate

    # Promote all eligible draft IRs
    python3 python/tackle/intent_requirement_promote.py

    # Promote a specific IR
    python3 python/tackle/intent_requirement_promote.py --intent-record <uuid>

    # Dry run
    python3 python/tackle/intent_requirement_promote.py --dry-run

    # Custom threshold
    python3 python/tackle/intent_requirement_promote.py --threshold 0.8
"""

import argparse
import json
import logging
import subprocess
import sys
import uuid as uuidlib
from datetime import datetime, timezone

log = logging.getLogger("ir_promote")

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


def fetch_draft_intents(limit: int = 100) -> list[dict]:
    """Fetch draft intent_records with candidate info."""
    sql = f"""
        SELECT row_to_json(r)::text FROM (
            SELECT
                ir.id,
                ir.title,
                ir.description,
                ir.candidate_id,
                ir.tags,
                ir.metadata,
                hc.title AS candidate_title,
                hc.compilation_readiness AS cpf,
                hc.code_snippets,
                hc.system_id,
                hc.subsystem_id,
                hc.feature_id,
                hc.tags AS candidate_tags
            FROM nebula.intent_records ir
            LEFT JOIN nebula.harvest_candidates hc ON hc.id = ir.candidate_id
            WHERE ir.status = 'draft'
            ORDER BY hc.compilation_readiness DESC NULLS LAST
            LIMIT {limit}
        ) r;
    """
    rc, out, err = psql(sql)
    if rc != 0 or not out:
        return []

    intents = []
    for line in out.splitlines():
        if not line:
            continue
        try:
            intents.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return intents


def fetch_single_intent(ir_id: str) -> dict | None:
    """Fetch a single intent_record."""
    sql = f"""
        SELECT row_to_json(r)::text FROM (
            SELECT
                ir.id, ir.title, ir.description, ir.candidate_id,
                ir.tags, ir.metadata,
                hc.title AS candidate_title,
                hc.compilation_readiness AS cpf,
                hc.code_snippets,
                hc.system_id, hc.subsystem_id, hc.feature_id,
                hc.tags AS candidate_tags
            FROM nebula.intent_records ir
            LEFT JOIN nebula.harvest_candidates hc ON hc.id = ir.candidate_id
            WHERE ir.id = '{ir_id}'
        ) r;
    """
    rc, out, err = psql(sql)
    if rc != 0 or not out:
        return None
    try:
        return json.loads(out.splitlines()[0])
    except (json.JSONDecodeError, IndexError):
        return None


def has_blocking_questions(candidate_id: str) -> tuple[bool, list[dict]]:
    """Check if candidate has blocking open_questions.

    Returns (is_blocked, questions).
    """
    if not candidate_id:
        return False, []

    sql = f"""
        SELECT row_to_json(r)::text FROM (
            SELECT id, title, category, status
            FROM nebula.open_questions
            WHERE candidate_id = '{candidate_id}'::uuid
              AND blocking = true
              AND status = 'OPEN'
        ) r;
    """
    rc, out, err = psql(sql)
    if rc != 0 or not out:
        return False, []

    questions = []
    for line in out.splitlines():
        if not line:
            continue
        try:
            questions.append(json.loads(line))
        except json.JSONDecodeError:
            continue

    return len(questions) > 0, questions


def check_existing_requirement(candidate_id: str) -> str | None:
    """Check if a requirement already exists for this candidate."""
    if not candidate_id:
        return None

    sql = f"""
        SELECT id FROM nebula.requirements
        WHERE candidate_id = '{candidate_id}'::uuid
        LIMIT 1;
    """
    rc, out, err = psql(sql)
    if rc == 0 and out:
        return out.strip()
    return None


def create_requirement(intent: dict, dry_run: bool = False) -> str | None:
    """Create a requirement in backlog status from an intent_record.

    Returns the requirement UUID or None on failure.
    """
    req_id = str(uuidlib.uuid4())
    title = intent["title"].replace("'", "''")
    description = (intent.get("description") or "").replace("'", "''")
    candidate_id = intent.get("candidate_id")
    system_id = intent.get("system_id")
    subsystem_id = intent.get("subsystem_id")
    feature_id = intent.get("feature_id")

    # Build metadata from intent metadata + CPF
    meta = intent.get("metadata") or {}
    cpf = meta.get("cpf") or intent.get("cpf")
    acceptance_criteria = json.dumps({"cpf": cpf, "source": "intent_record_promotion"}) if cpf else None

    # Combine tags from intent + candidate
    tags = intent.get("tags") or []
    candidate_tags = intent.get("candidate_tags") or []
    all_tags = list(set(tags + candidate_tags + ["promoted-from-intent-record"]))

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    def sql_val(v):
        if v is None:
            return "NULL"
        if isinstance(v, str):
            return f"'{v}'"
        return str(v)

    sql = f"""
        INSERT INTO nebula.requirements_history
            (id, title, description, status, priority, req_type,
             system_id, subsystem_id, feature_id, candidate_id,
             acceptance_criteria, created_at, recorded_on_dt, valid_from, valid_until)
        VALUES (
            '{req_id}'::uuid,
            '{title}',
            '{description}',
            'Backlog',
            'Medium',
            'Story',
            {sql_val(system_id)}::uuid,
            {sql_val(subsystem_id)}::uuid,
            {sql_val(feature_id)}::uuid,
            {sql_val(candidate_id)}::uuid,
            {sql_val(acceptance_criteria)}::jsonb,
            '{now}',
            '{now}',
            '{now}',
            '9999-12-31T00:00:00Z'
        )
        RETURNING id;
    """

    if dry_run:
        log.info("  [DRY RUN] Would create requirement: %s", title[:60])
        return req_id

    rc, out, err = psql(sql)
    if rc != 0 or not out:
        details = err[:200] if err else out[:200]
        log.error("  Failed to create requirement: %s", details)
        return None

    return req_id


def update_intent_status(ir_id: str, new_status: str, requirement_id: str, dry_run: bool = False) -> bool:
    """Update intent_record status after promotion."""
    if dry_run:
        log.info("  [DRY RUN] Would update IR %s → %s", ir_id[:8], new_status)
        return True

    sql = f"""
        UPDATE nebula.intent_records
        SET status = '{new_status}',
            updated_at = now()
        WHERE id = '{ir_id}'::uuid;
    """
    rc, out, err = psql(sql)
    if rc != 0:
        log.warning("  Could not update IR status: %s", (err or out)[:100])
        return False
    return True


def promote_intent(intent: dict, threshold: float, dry_run: bool = False) -> dict:
    """Evaluate and promote a single intent_record to requirement.

    Returns a result dict with outcome and reasoning.
    """
    ir_id = intent["id"]
    title = intent.get("title", "?")
    cpf = intent.get("cpf")
    code_snippets = intent.get("code_snippets") or []
    candidate_id = intent.get("candidate_id")
    has_code = len(code_snippets) > 0

    result = {
        "intent_record_id": ir_id,
        "title": title,
        "requirement_id": None,
        "success": False,
        "reason": None,
        "cpf": cpf,
        "has_code": has_code,
    }

    # Gate 1: CPF threshold OR has code
    meets_cpf = cpf is not None and cpf >= threshold
    if not meets_cpf and not has_code:
        result["reason"] = f"CPF={cpf} < {threshold} and no code snippets"
        log.info("  ⊘ %s — %s", title[:50], result["reason"])
        return result

    # Gate 2: No blocking questions
    blocked, questions = has_blocking_questions(candidate_id)
    if blocked:
        q_summary = "; ".join(q["title"][:40] for q in questions[:3])
        result["reason"] = f"Blocked by {len(questions)} open question(s): {q_summary}"
        log.info("  ⊘ %s — %s", title[:50], result["reason"])
        return result

    # Gate 3: No existing requirement for this candidate
    existing = check_existing_requirement(candidate_id)
    if existing:
        result["reason"] = f"Requirement {existing[:8]} already exists for this candidate"
        log.info("  ⊘ %s — %s", title[:50], result["reason"])
        return result

    # All gates passed — promote
    signal = f"CPF={cpf}" if meets_cpf else f"code={len(code_snippets)} snippets"
    log.info("  ✓ Promoting (%s): %s", signal, title[:55])

    req_id = create_requirement(intent, dry_run)
    if not req_id:
        result["reason"] = "Requirement creation failed"
        return result

    result["requirement_id"] = req_id
    result["success"] = True

    update_intent_status(ir_id, "decomposed", req_id, dry_run)

    return result


def main():
    parser = argparse.ArgumentParser(
        description="IntentRecord → Requirement promotion gate"
    )
    parser.add_argument("--intent-record", type=str, default=None,
                        help="Promote a specific intent_record UUID")
    parser.add_argument("--threshold", type=float, default=0.7,
                        help="CPF threshold (default 0.7)")
    parser.add_argument("--limit", type=int, default=50,
                        help="Max intent_records to process")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview without DB writes")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("IntentRecord → Requirement Promotion Gate")
    log.info("Time: %s", datetime.now().isoformat())
    log.info("Mode: %s", "DRY RUN" if args.dry_run else "LIVE")
    log.info("Threshold: CPF >= %.2f OR has code snippets", args.threshold)
    log.info("=" * 60)

    # Fetch intents
    if args.intent_record:
        intent = fetch_single_intent(args.intent_record)
        if not intent:
            log.error("Intent record not found: %s", args.intent_record)
            return 1
        intents = [intent]
    else:
        intents = fetch_draft_intents(args.limit)
        log.info("Draft intent_records: %d", len(intents))

    if not intents:
        log.info("Nothing to promote.")
        return 0

    stats = {"promoted": 0, "skipped_cpf": 0, "skipped_blocked": 0,
             "skipped_existing": 0, "failed": 0}

    for intent in intents:
        log.info("-" * 50)
        log.info("Processing: %s", intent.get("title", "?")[:60])

        result = promote_intent(intent, args.threshold, args.dry_run)

        if result["success"]:
            stats["promoted"] += 1
        elif result["reason"] and "CPF=" in result["reason"] and "code" in result["reason"]:
            stats["skipped_cpf"] += 1
        elif result["reason"] and "question" in result["reason"].lower():
            stats["skipped_blocked"] += 1
        elif result["reason"] and "already exists" in result["reason"].lower():
            stats["skipped_existing"] += 1
        else:
            stats["failed"] += 1

    # Summary
    log.info("=" * 60)
    log.info("Promotion Summary:")
    log.info("  Promoted:        %d", stats["promoted"])
    log.info("  Skipped (CPF):   %d", stats["skipped_cpf"])
    log.info("  Skipped (blocked): %d", stats["skipped_blocked"])
    log.info("  Skipped (exists):  %d", stats["skipped_existing"])
    log.info("  Failed:          %d", stats["failed"])
    log.info("=" * 60)

    return 0 if stats["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
