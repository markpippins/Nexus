#!/usr/bin/env python3
"""planner.py — Planner workflow orchestrator with cascade events.

This script runs the Planner's backlog grooming cycle:
1. Scan candidates for CPF assessment
2. Compute CPF scores
3. Generate open questions for gaps
4. Emit cascade events at each decision point

Events emitted:
  - candidate.assessed — CPF scoring completed
  - question.created — open question generated from CPF gaps
  - candidate.greenlit — ready for promotion (CPF >= 0.7, risk != CRITICAL)
  - candidate.escalated — needs human review (risk == CRITICAL)

Usage:
    cd /home/codex/dev/nexus/python/rover
    source .venv/bin/activate
    
    # Full grooming cycle
    python3 planner.py
    
    # Assess specific candidate
    python3 planner.py --candidate <uuid>
    
    # Dry run (no DB writes, no events)
    python3 planner.py --dry-run
    
    # Generate questions only (no promotion)
    python3 planner.py --questions-only
"""

import argparse
import json
import logging
import subprocess
import sys
from datetime import datetime

from event_emitter import (
    emit_candidate_assessed,
    emit_candidate_escalated,
    emit_candidate_greenlit,
    emit_question_created,
    emit_ripple_assessed,
)

log = logging.getLogger("planner")

DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)


def psql(sql: str, timeout: int = 30) -> tuple[int, str]:
    """Execute SQL via docker psql."""
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, result.stdout.strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)"


def assess_candidate(candidate_id: str, dry_run: bool = False) -> dict | None:
    """Run CPF assessment on a single candidate."""
    log.info("Assessing candidate: %s", candidate_id[:8])
    
    sql = f"SELECT nebula.assess_cpf('{candidate_id}'::uuid);"
    rc, out = psql(sql)
    
    if rc != 0 or not out:
        log.error("Failed to assess candidate %s", candidate_id[:8])
        return None
    
    try:
        assessment = json.loads(out)
    except json.JSONDecodeError:
        log.error("Failed to parse assessment for %s", candidate_id[:8])
        return None
    
    score = assessment.get("score", 0)
    promotable = assessment.get("promotable", False)
    components = assessment.get("components", {})
    questions = assessment.get("suggested_questions", [])
    
    log.info(
        "  CPF=%.3f %s [intent=%.2f hier=%.2f tags=%.2f art=%.2f rec=%.2f deps=%.2f]",
        score,
        "⚡READY" if promotable else "  gap",
        components.get("intent_filled", 0),
        components.get("hierarchy_mapped", 0),
        components.get("tagged", 0),
        components.get("has_artifacts", 0),
        components.get("reconciled", 0),
        components.get("deps_resolved", 0),
    )
    
    if not dry_run:
        # Emit candidate.assessed event
        emit_candidate_assessed(
            candidate_id=candidate_id,
            cpf_score=score,
            components=components,
            promotable=promotable,
        )
    
    return assessment


def create_questions(candidate_id: str, assessment: dict, dry_run: bool = False) -> list[dict]:
    """Generate open questions from CPF gaps."""
    questions = assessment.get("suggested_questions", [])
    
    if not questions:
        log.info("  No gaps — candidate is ready")
        return []
    
    log.info("  Creating %d open questions...", len(questions))
    created = []
    
    for q in questions:
        if dry_run:
            log.info("    [DRY RUN] Would create: %s (%s)", q["question"][:60], q["category"])
            created.append(q)
            continue
        
        # Insert into database
        sql = f"""
            INSERT INTO nebula.open_questions (
                requirement_id, title, description, category, status, blocking, created_by
            ) VALUES (
                NULL,
                '{q["question"].replace("'", "''")}',
                'Auto-generated from CPF assessment. Component: {q["component"]}.',
                '{q["category"]}',
                'OPEN',
                true,
                'planner'
            )
            RETURNING id;
        """
        rc, out = psql(sql)
        
        if rc == 0 and out:
            question_id = out.strip()
            log.info("    Created question: %s", question_id[:8])
            
            # Emit question.created event
            emit_question_created(
                question_id=question_id,
                candidate_id=candidate_id,
                category=q["category"],
                title=q["question"],
                causation_id=None,  # Would need to track from assess event
            )
            
            created.append({"id": question_id, **q})
        else:
            log.error("    Failed to create question: %s", q["question"][:40])
    
    return created


def check_ripple_assessment(requirement_id: str, dry_run: bool = False) -> dict | None:
    """Run ripple assessment if requirement exists."""
    sql = f"SELECT nebula.assess_ripple('{requirement_id}'::uuid);"
    rc, out = psql(sql)
    
    if rc != 0 or not out:
        return None
    
    try:
        result = json.loads(out)
    except json.JSONDecodeError:
        return None
    
    risk = result.get("risk_level", "UNKNOWN")
    blast = result.get("blast_radius", {})
    blocking = result.get("questions", {}).get("total_blocking", 0)
    
    if not dry_run:
        emit_ripple_assessed(
            requirement_id=requirement_id,
            risk_level=risk,
            blast_radius=blast,
            blocking_questions=blocking,
        )
    
    return result


def promote_candidate(candidate_id: str, assessment: dict, risk_level: str, dry_run: bool = False) -> bool:
    """Promote candidate to requirement."""
    score = assessment.get("score", 0)
    
    if dry_run:
        log.info("  [DRY RUN] Would promote %s (CPF=%.3f, risk=%s)", candidate_id[:8], score, risk_level)
        return True
    
    # Emit candidate.greenlit event
    event_id = emit_candidate_greenlit(
        candidate_id=candidate_id,
        cpf_score=score,
        risk_level=risk_level,
    )
    
    log.info("  ✓ Greenlit: %s (event: %s)", candidate_id[:8], event_id[:8])
    return True


def escalate_candidate(candidate_id: str, assessment: dict, risk_level: str, reason: str, dry_run: bool = False) -> bool:
    """Escalate candidate for human review."""
    score = assessment.get("score", 0)
    
    if dry_run:
        log.info("  [DRY RUN] Would escalate %s (CPF=%.3f, risk=%s, reason=%s)", 
                 candidate_id[:8], score, risk_level, reason[:40])
        return True
    
    # Emit candidate.escalated event
    emit_candidate_escalated(
        candidate_id=candidate_id,
        cpf_score=score,
        risk_level=risk_level,
        reason=reason,
    )
    
    log.info("  ⚠ Escalated: %s (reason: %s)", candidate_id[:8], reason[:40])
    return True


def get_candidates_for_grooming(limit: int = 50) -> list[dict]:
    """Get candidates that need CPF assessment."""
    sql = f"""
        SELECT id, title, compilation_readiness, status
        FROM nebula.harvest_candidates
        WHERE status = 'pending'
        ORDER BY compilation_readiness DESC NULLS LAST
        LIMIT {limit};
    """
    rc, out = psql(sql)
    
    if rc != 0 or not out:
        return []
    
    candidates = []
    for line in out.splitlines():
        if not line:
            continue
        parts = line.split("|")
        if len(parts) >= 4:
            candidates.append({
                "id": parts[0],
                "title": parts[1],
                "compilation_readiness": float(parts[2]) if parts[2] else None,
                "status": parts[3],
            })
    
    return candidates


def run_grooming_cycle(args):
    """Run a full grooming cycle."""
    log.info("=" * 60)
    log.info("Planner Grooming Cycle")
    log.info("Time: %s", datetime.now().isoformat())
    log.info("Mode: %s", "DRY RUN" if args.dry_run else "LIVE")
    log.info("=" * 60)
    
    if args.candidate:
        # Assess single candidate
        candidates = [{"id": args.candidate, "title": "manual"}]
    else:
        # Get candidates for grooming
        candidates = get_candidates_for_grooming(args.limit)
        log.info("Candidates for grooming: %d", len(candidates))
    
    if not candidates:
        log.info("Nothing to groom.")
        return
    
    stats = {"assessed": 0, "questions_created": 0, "greenlit": 0, "escalated": 0}
    
    for c in candidates:
        cid = c["id"]
        log.info("-" * 40)
        log.info("Processing: %s", c.get("title", cid[:8])[:60])
        
        # 1. CPF Assessment
        assessment = assess_candidate(cid, args.dry_run)
        if not assessment:
            continue
        stats["assessed"] += 1
        
        score = assessment.get("score", 0)
        promotable = assessment.get("promotable", False)
        
        # 2. Generate questions for gaps
        if not args.no_questions:
            questions = create_questions(cid, assessment, args.dry_run)
            stats["questions_created"] += len(questions)
        
        if args.questions_only:
            continue
        
        # 3. Decision point
        if promotable:
            # Check ripple assessment if requirement exists
            ripple = check_ripple_assessment(cid, args.dry_run)
            
            if ripple:
                risk = ripple.get("risk_level", "UNKNOWN")
                blocking = ripple.get("questions", {}).get("total_blocking", 0)
                
                if risk == "CRITICAL" or blocking > 0:
                    escalate_candidate(cid, assessment, risk, 
                                     f"Risk={risk}, blocking_questions={blocking}",
                                     args.dry_run)
                    stats["escalated"] += 1
                else:
                    promote_candidate(cid, assessment, risk, args.dry_run)
                    stats["greenlit"] += 1
            else:
                # No ripple assessment available — greenlight based on CPF alone
                promote_candidate(cid, assessment, "LOW", args.dry_run)
                stats["greenlit"] += 1
        else:
            log.info("  Not promotable (CPF < 0.7)")
    
    # Summary
    log.info("=" * 60)
    log.info("Grooming Summary:")
    log.info("  Assessed: %d", stats["assessed"])
    log.info("  Questions created: %d", stats["questions_created"])
    log.info("  Greenlit: %d", stats["greenlit"])
    log.info("  Escalated: %d", stats["escalated"])
    log.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Planner backlog grooming with cascade events")
    parser.add_argument("--candidate", type=str, help="Assess a specific candidate UUID")
    parser.add_argument("--limit", type=int, default=50, help="Max candidates to process")
    parser.add_argument("--dry-run", action="store_true", help="Preview without DB writes or events")
    parser.add_argument("--questions-only", action="store_true", help="Generate questions only, no promotion")
    parser.add_argument("--no-questions", action="store_true", help="Skip question generation")
    args = parser.parse_args()
    
    run_grooming_cycle(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
