#!/usr/bin/env python3
"""
backfill_candidate_agent_record_links.py — Fuzzy-match candidates to agent records.

Implements the three-tier approach from the linkage audit:
  1. Tag-based matching — filter agent_records by relevant tags, match by keyword overlap
  2. Title ILIKE matching — direct ILIKE of candidate keywords against agent_record titles
  3. Open questions bridge — match through answered questions referencing candidates

Does NOT write to the database. Outputs a candidate→agent_record mapping JSON file
suitable for later use by the implementation_notes backfill or FK column population.

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate

    # Process the 91 priority "No" answer candidates
    python3 bin/backfill_candidate_agent_record_links.py --priority

    # Process ALL candidates (warning: slow)
    python3 bin/backfill_candidate_agent_record_links.py --all

    # Process a specific candidate by ID
    python3 bin/backfill_candidate_agent_record_links.py --candidate-id <uuid>

    # Output to a specific file
    python3 bin/backfill_candidate_agent_record_links.py --priority -o /path/to/output.json
"""

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

LOG_DIR = Path("/home/codex/dev/nexus/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import psycopg2
from tackle.harness.analyst import _extract_keywords

log = logging.getLogger("backfill_links")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stderr),
        logging.FileHandler(LOG_DIR / "backfill_candidate_links.log"),
    ],
)

PG_DSN = "postgresql://pguser:pgpass@localhost:5432/nexus"

# Agent record types worth backfilling
TARGET_RECORD_TYPES = [
    "implementation_plan",
    "architecture_note",
    "decision",
    "engineering_log",
    "report",
    "analysis",
]

# Tags that indicate a record is relevant to implementation/planning work
RELEVANT_TAGS = [
    "to:architect", "to:engineer", "type:decision", "type:proposal",
    "type:status-update", "to:planner", "to:reviewer",
]


def load_priority_candidates(conn) -> list[dict]:
    """Load the 91 candidates from the 'No' answers audit."""
    cur = conn.cursor()
    cur.execute("""
        SELECT DISTINCT hc.id, hc.title, hc.intent_description, hc.status
        FROM nebula.harvest_candidates hc
        WHERE hc.id IN (
            SELECT DISTINCT oq.candidate_id
            FROM nebula.open_questions oq
            JOIN nebula.open_question_answers oqa ON oqa.question_id = oq.id
            WHERE oqa.answer ILIKE 'No%' AND oq.candidate_id IS NOT NULL
        )
        ORDER BY hc.title
    """)
    cols = [d.name for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()
    return rows


def load_all_candidates(conn) -> list[dict]:
    """Load all candidates with non-empty titles."""
    cur = conn.cursor()
    cur.execute("""
        SELECT id, title, intent_description, status
        FROM nebula.harvest_candidates
        WHERE title IS NOT NULL AND length(title) > 5
        ORDER BY title
    """)
    cols = [d.name for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()
    return rows


def tier1_tag_matching(conn, candidate: dict) -> list[dict]:
    """Tier 1: Match by tag filtering + keyword overlap in title/content."""
    keywords = _extract_keywords(candidate["title"])
    if not keywords:
        return []

    cur = conn.cursor()
    # Build parameterized ILIKE for each keyword
    like_clauses: list[str] = []
    params: list[str] = []
    for kw in keywords[:5]:
        like_clauses.append("(ar.title ILIKE %s OR ar.content ILIKE %s)")
        params.extend([f"%{kw}%", f"%{kw}%"])

    where_sql = " OR ".join(like_clauses)
    tag_placeholders = ", ".join(["%s"] * len(RELEVANT_TAGS))

    query = f"""
        SELECT ar.id, ar.title, ar.record_type, ar.role, ar.tags,
               ar.created_at, ar.plan_ref,
               GREATEST(
                 {' + '.join(f'CASE WHEN ar.title ILIKE %s THEN 1 ELSE 0 END' for _ in keywords[:5])},
                 {' + '.join(f'CASE WHEN ar.content ILIKE %s THEN 1 ELSE 0 END' for _ in keywords[:5])}
               ) AS keyword_score
        FROM nebula.agent_records ar
        WHERE ({where_sql})
          AND ar.record_type = ANY(%s)
          AND ar.tags && ARRAY[{tag_placeholders}]
        ORDER BY keyword_score DESC
        LIMIT 10
    """
    # Build full params: WHERE has 10 placeholders (title+content ILIKE pairs);
    # GREATEST has 5 title CASE + 5 content CASE; then record_types; then tags
    case_params = [f"%{kw}%" for kw in keywords[:5]]
    all_params = (
        params  # 10 params for WHERE ILIKE
        + case_params  # 5 params for title CASE
        + case_params  # 5 params for content CASE
        + [TARGET_RECORD_TYPES]  # ANY(%s)
        + RELEVANT_TAGS  # ARRAY[...]
    )

    cur.execute(query, all_params)
    cols = [d.name for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()

    for r in rows:
        r["tier"] = 1
        r["match_method"] = "tag_keyword"
    return rows


def tier2_title_ilike(conn, candidate: dict) -> list[dict]:
    """Tier 2: Direct ILIKE of candidate title keywords against agent_record titles."""
    keywords = _extract_keywords(candidate["title"])
    if not keywords:
        return []

    cur = conn.cursor()
    like_clauses: list[str] = []
    params: list[str] = []
    for kw in keywords[:5]:
        like_clauses.append("ar.title ILIKE %s")
        params.append(f"%{kw}%")

    where_sql = " OR ".join(like_clauses)
    query = f"""
        SELECT ar.id, ar.title, ar.record_type, ar.role, ar.tags,
               ar.created_at, ar.plan_ref,
               {' + '.join(f'CASE WHEN ar.title ILIKE %s THEN 1 ELSE 0 END' for _ in keywords[:5])} AS keyword_score
        FROM nebula.agent_records ar
        WHERE ({where_sql})
          AND ar.record_type = ANY(%s)
        ORDER BY keyword_score DESC
        LIMIT 10
    """
    all_params = params + params + [TARGET_RECORD_TYPES]  # WHERE params + CASE params + record_types
    cur.execute(query, all_params)
    cols = [d.name for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()

    for r in rows:
        r["tier"] = 2
        r["match_method"] = "title_ilike"
    return rows


def tier3_question_bridge(conn, candidate: dict) -> list[dict]:
    """Tier 3: Find agent records via open questions linked to this candidate."""
    cur = conn.cursor()

    # Get answers to questions linked to this candidate
    cur.execute("""
        SELECT oqa.answer
        FROM nebula.open_questions oq
        JOIN nebula.open_question_answers oqa ON oqa.question_id = oq.id
        WHERE oq.candidate_id = %s
        ORDER BY oqa.answered_at DESC
        LIMIT 10
    """, (candidate["id"],))
    answers = [r[0] for r in cur.fetchall() if r[0]]

    if not answers:
        cur.close()
        return []

    # Extract keywords from all answers collectively
    all_answer_text = " ".join(a[:500] for a in answers)
    keywords = _extract_keywords(all_answer_text)
    if not keywords:
        cur.close()
        return []

    like_clauses: list[str] = []
    params: list[str] = []
    for kw in keywords[:5]:
        like_clauses.append("(ar.title ILIKE %s OR ar.content ILIKE %s)")
        params.extend([f"%{kw}%", f"%{kw}%"])

    where_sql = " OR ".join(like_clauses)
    query = f"""
        SELECT ar.id, ar.title, ar.record_type, ar.role, ar.tags,
               ar.created_at, ar.plan_ref,
               {' + '.join(f'CASE WHEN ar.title ILIKE %s THEN 1 ELSE 0 END' for _ in keywords[:5])} AS keyword_score
        FROM nebula.agent_records ar
        WHERE ({where_sql})
          AND ar.record_type = ANY(%s)
        ORDER BY keyword_score DESC
        LIMIT 10
    """
    # CASE uses only title keywords (5), but params has title+content pairs (10)
    case_params = params[::2]  # every other: just the title ILIKE values
    all_params = params + case_params + [TARGET_RECORD_TYPES]
    cur.execute(query, all_params)
    cols = [d.name for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()

    for r in rows:
        r["tier"] = 3
        r["match_method"] = "question_bridge"
    return rows


def match_candidate(conn, candidate: dict) -> dict:
    """Run all three tiers and return deduplicated, scored results."""
    keywords = _extract_keywords(candidate["title"])
    log.info("Matching: %s", candidate["title"][:80])
    log.debug("  Keywords: %s", keywords)

    seen_ids: set[str] = set()
    all_matches: list[dict] = []

    for tier_fn, tier_name in [
        (tier1_tag_matching, "tag"),
        (tier2_title_ilike, "title"),
        (tier3_question_bridge, "question"),
    ]:
        try:
            matches = tier_fn(conn, candidate)
            new_matches = [m for m in matches if m["id"] not in seen_ids]
            for m in new_matches:
                seen_ids.add(m["id"])
            all_matches.extend(new_matches)
            log.info("  Tier %s: %d matches (%d new)", tier_name, len(matches), len(new_matches))
        except Exception as e:
            log.warning("  Tier %s failed: %s", tier_name, e)

    return {
        "candidate_id": candidate["id"],
        "candidate_title": candidate["title"],
        "candidate_status": candidate["status"],
        "keywords": keywords,
        "matches": all_matches,
        "match_count": len(all_matches),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Fuzzy-match candidates to agent records (3-tier approach)"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--priority", action="store_true",
                       help="Process the 91 priority 'No' answer candidates")
    group.add_argument("--all", action="store_true",
                       help="Process ALL candidates (slow)")
    group.add_argument("--candidate-id", type=str, help="Process a single candidate by UUID")
    parser.add_argument("-o", "--output", type=str,
                        default="candidate_agent_record_links.json",
                        help="Output JSON file path (default: candidate_agent_record_links.json)")
    args = parser.parse_args()

    log.info("Starting candidate→agent_record fuzzy matching")
    conn = psycopg2.connect(PG_DSN)

    try:
        if args.priority:
            candidates = load_priority_candidates(conn)
            log.info("Loaded %d priority candidates (from 'No' answers)", len(candidates))
        elif args.all:
            candidates = load_all_candidates(conn)
            log.info("Loaded %d total candidates", len(candidates))
        else:
            cur = conn.cursor()
            cur.execute(
                "SELECT id, title, intent_description, status FROM nebula.harvest_candidates WHERE id = %s",
                (args.candidate_id,)
            )
            cols = [d.name for d in cur.description]
            row = cur.fetchone()
            cur.close()
            if not row:
                log.error("Candidate not found: %s", args.candidate_id)
                return 1
            candidates = [dict(zip(cols, row))]
            log.info("Processing single candidate: %s", candidates[0]["title"][:80])

        results: list[dict] = []
        for i, c in enumerate(candidates):
            result = match_candidate(conn, c)
            results.append(result)
            if (i + 1) % 10 == 0:
                log.info("Progress: %d/%d candidates processed", i + 1, len(candidates))

        # Summary
        matched = [r for r in results if r["match_count"] > 0]
        total_matches = sum(r["match_count"] for r in results)
        by_tier: dict[int, int] = {}
        for r in results:
            for m in r["matches"]:
                tier = m.get("tier", 0)
                by_tier[tier] = by_tier.get(tier, 0) + 1

        log.info("=== Summary ===")
        log.info("Candidates processed: %d", len(results))
        log.info("Candidates with matches: %d (%.1f%%)", len(matched),
                 len(matched) / len(results) * 100 if results else 0)
        log.info("Total matches: %d", total_matches)
        for tier in sorted(by_tier):
            log.info("  Tier %d: %d matches", tier, by_tier[tier])

        # Write output
        output_path = Path(args.output)
        output_data = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "candidate_count": len(results),
            "matched_candidate_count": len(matched),
            "total_matches": total_matches,
            "by_tier": by_tier,
            "results": results,
        }
        with open(output_path, "w") as f:
            json.dump(output_data, f, indent=2, default=str)
        log.info("Output written to %s (%d bytes)", output_path, output_path.stat().st_size)

    except Exception as e:
        log.error("Fatal error: %s", e, exc_info=True)
        return 1
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
