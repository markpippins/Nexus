#!/usr/bin/env python3
"""planner-mcp: Knowledge graph queries for Planner backlog grooming.

The Planner doesn't scan the database itself — it queries the knowledge
graph for evidence of completion, deduplication, and relevance. Evidence
becomes open questions that block promotion until resolved.

Usage:
    python3 planner_mcp_server.py
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone

import psycopg2
from mcp.server.fastmcp import FastMCP

# ── logging ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("planner-mcp")

# ── server ───────────────────────────────────────────────────────────
mcp = FastMCP("planner-mcp")

# ── DB config ────────────────────────────────────────────────────────
DB_CONFIG = {
    "host": os.getenv("PG_HOST", "localhost"),
    "port": int(os.getenv("PG_PORT", "5432")),
    "database": os.getenv("PG_DATABASE", "nexus"),
    "user": os.getenv("PG_USER", "pguser"),
    "password": os.getenv("PG_PASSWORD", "pgpass"),
}


def _get_conn():
    """Open a psycopg2 connection to the nexus database."""
    return psycopg2.connect(**DB_CONFIG)


# ── Knowledge Graph Queries ─────────────────────────────────────────

@mcp.tool()
def check_completion_evidence(candidate_id: str) -> str:
    """Check if similar work has been completed.
    
    Queries the knowledge graph for:
    - Completed WorkRequests with similar titles
    - Completed execution requests
    - Recent cascade events about similar work
    
    Returns evidence that can be used to create open questions.
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            # Get candidate details
            cur.execute(
                "SELECT id, title, system_id, subsystem_id FROM nebula.harvest_candidates WHERE id = %s::uuid",
                (candidate_id,),
            )
            candidate = cur.fetchone()
            if not candidate:
                return json.dumps({"error": "Candidate not found"})
            
            cand_id, title, system_id, subsystem_id = candidate
            
            evidence = []
            
            # 1. Check completed WorkRequests
            cur.execute("""
                SELECT id, title, business_status, consumed_at
                FROM nebula.work_requests
                WHERE business_status IN ('COMPLETED', 'DISPATCHED')
                AND (
                    similarity(lower(title), lower(%s)) > 0.3
                    OR lower(title) LIKE '%%' || lower(%s) || '%%'
                    OR lower(%s) LIKE '%%' || lower(title) || '%%'
                )
                ORDER BY consumed_at DESC NULLS LAST
                LIMIT 5
            """, (title, title, title))
            
            for row in cur.fetchall():
                evidence.append({
                    "type": "work_request_completed",
                    "id": str(row[0]),
                    "title": row[1],
                    "status": row[2],
                    "completed_at": row[3].isoformat() if row[3] else None,
                    "confidence": "high" if row[2] == "COMPLETED" else "medium",
                })
            
            # 2. Check completed execution requests
            cur.execute("""
                SELECT er.id, er.business_key, er.status, er.updated_at
                FROM execution.requests er
                WHERE er.status = 'COMPLETED'
                AND (
                    similarity(lower(er.business_key), lower(%s)) > 0.3
                    OR lower(er.business_key) LIKE '%%' || lower(%s) || '%%'
                )
                ORDER BY er.updated_at DESC NULLS LAST
                LIMIT 5
            """, (title, title))
            
            for row in cur.fetchall():
                evidence.append({
                    "type": "execution_completed",
                    "id": str(row[0]),
                    "title": row[1],
                    "status": row[2],
                    "completed_at": row[3].isoformat() if row[3] else None,
                    "confidence": "medium",
                })
            
            # 3. Check promoted candidates (potential duplicates)
            cur.execute("""
                SELECT id, title, compilation_readiness, status
                FROM nebula.harvest_candidates
                WHERE status IN ('promoted', 'linked')
                AND id != %s::uuid
                AND (
                    similarity(lower(title), lower(%s)) > 0.4
                    OR lower(title) LIKE '%%' || lower(%s) || '%%'
                    OR lower(%s) LIKE '%%' || lower(title) || '%%'
                )
                ORDER BY compilation_readiness DESC
                LIMIT 5
            """, (cand_id, title, title, title))
            
            for row in cur.fetchall():
                evidence.append({
                    "type": "duplicate_candidate",
                    "id": str(row[0]),
                    "title": row[1],
                    "cpf_score": float(row[2]) if row[2] else None,
                    "status": row[3],
                    "confidence": "high" if float(row[2] or 0) >= 0.7 else "medium",
                })
            
            # 4. Check recent cascade events about completion
            cur.execute("""
                SELECT event_type, payload, event_timestamp
                FROM cascade.events
                WHERE event_type IN ('candidate.promoted', 'requirement.promoted_to_plan')
                AND (
                    similarity(lower(payload->>'title'::text), lower(%s)) > 0.3
                    OR lower(payload->>'title'::text) LIKE '%%' || lower(%s) || '%%'
                )
                ORDER BY event_timestamp DESC
                LIMIT 5
            """, (title, title))
            
            for row in cur.fetchall():
                evidence.append({
                    "type": "cascade_event",
                    "event_type": row[0],
                    "payload": row[1],
                    "timestamp": row[2].isoformat() if row[2] else None,
                    "confidence": "medium",
                })
            
            return json.dumps({
                "candidate_id": candidate_id,
                "title": title,
                "evidence_count": len(evidence),
                "evidence": evidence,
                "recommendation": "escalate" if len(evidence) > 0 else "clear",
            }, default=str)
            
    finally:
        conn.close()


@mcp.tool()
def check_duplicate_candidates(candidate_id: str) -> str:
    """Check if similar candidates already exist.
    
    Queries for candidates with similar titles that are already
    promoted, linked, or have high CPF scores.
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            # Get candidate details
            cur.execute(
                "SELECT id, title FROM nebula.harvest_candidates WHERE id = %s::uuid",
                (candidate_id,),
            )
            candidate = cur.fetchone()
            if not candidate:
                return json.dumps({"error": "Candidate not found"})
            
            cand_id, title = candidate
            
            # Find similar candidates
            cur.execute("""
                SELECT id, title, compilation_readiness, status,
                       similarity(lower(title), lower(%s)) as sim
                FROM nebula.harvest_candidates
                WHERE id != %s::uuid
                AND (
                    similarity(lower(title), lower(%s)) > 0.3
                    OR lower(title) LIKE '%%' || lower(%s) || '%%'
                    OR lower(%s) LIKE '%%' || lower(title) || '%%'
                )
                ORDER BY sim DESC
                LIMIT 10
            """, (title, cand_id, title, title, title))
            
            duplicates = []
            for row in cur.fetchall():
                duplicates.append({
                    "id": str(row[0]),
                    "title": row[1],
                    "cpf_score": float(row[2]) if row[2] else None,
                    "status": row[3],
                    "similarity": float(row[4]) if row[4] else None,
                })
            
            return json.dumps({
                "candidate_id": candidate_id,
                "title": title,
                "duplicate_count": len(duplicates),
                "duplicates": duplicates,
            }, default=str)
            
    finally:
        conn.close()


@mcp.tool()
def check_work_request_overlap(candidate_id: str) -> str:
    """Check if candidate overlaps with existing work requests.
    
    Queries work_requests, execution requests, and requirements
    for overlapping work.
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            # Get candidate details
            cur.execute(
                "SELECT id, title FROM nebula.harvest_candidates WHERE id = %s::uuid",
                (candidate_id,),
            )
            candidate = cur.fetchone()
            if not candidate:
                return json.dumps({"error": "Candidate not found"})
            
            cand_id, title = candidate
            
            overlaps = []
            
            # Check nebula.work_requests
            cur.execute("""
                SELECT id, title, business_status, created_at
                FROM nebula.work_requests
                WHERE similarity(lower(title), lower(%s)) > 0.25
                ORDER BY created_at DESC
                LIMIT 5
            """, (title,))
            
            for row in cur.fetchall():
                overlaps.append({
                    "table": "nebula.work_requests",
                    "id": str(row[0]),
                    "title": row[1],
                    "status": row[2],
                    "created_at": row[3].isoformat() if row[3] else None,
                })
            
            # Check execution.requests
            cur.execute("""
                SELECT id, business_key, status, created_at
                FROM execution.requests
                WHERE similarity(lower(business_key), lower(%s)) > 0.25
                ORDER BY created_at DESC
                LIMIT 5
            """, (title,))
            
            for row in cur.fetchall():
                overlaps.append({
                    "table": "execution.requests",
                    "id": str(row[0]),
                    "title": row[1],
                    "status": row[2],
                    "created_at": row[3].isoformat() if row[3] else None,
                })
            
            return json.dumps({
                "candidate_id": candidate_id,
                "title": title,
                "overlap_count": len(overlaps),
                "overlaps": overlaps,
            }, default=str)
            
    finally:
        conn.close()


@mcp.tool()
def assess_candidate_relevance(candidate_id: str) -> str:
    """Full relevance assessment combining all knowledge graph queries.
    
    Returns a comprehensive assessment with:
    - Completion evidence
    - Duplicate candidates
    - Work request overlaps
    - Recommendation (clear/escalate/block)
    """
    # Run all checks
    completion = json.loads(check_completion_evidence(candidate_id))
    duplicates = json.loads(check_duplicate_candidates(candidate_id))
    overlaps = json.loads(check_work_request_overlap(candidate_id))
    
    # Determine recommendation
    has_completion = completion.get("evidence_count", 0) > 0
    has_duplicates = duplicates.get("duplicate_count", 0) > 0
    has_overlaps = overlaps.get("overlap_count", 0) > 0
    
    if has_completion:
        # Strong evidence of completed work
        high_confidence = any(
            e.get("confidence") == "high" 
            for e in completion.get("evidence", [])
        )
        recommendation = "block" if high_confidence else "escalate"
    elif has_duplicates and has_overlaps:
        # Multiple signals — escalate
        recommendation = "escalate"
    elif has_duplicates or has_overlaps:
        # Weak signals — escalate for review
        recommendation = "escalate"
    else:
        # No evidence of overlap
        recommendation = "clear"
    
    return json.dumps({
        "candidate_id": candidate_id,
        "completion_evidence": completion,
        "duplicate_candidates": duplicates,
        "work_request_overlaps": overlaps,
        "recommendation": recommendation,
        "signals": {
            "completion": has_completion,
            "duplicates": has_duplicates,
            "overlaps": has_overlaps,
        },
    }, default=str)


# ── Main ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run()
