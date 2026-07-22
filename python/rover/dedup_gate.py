#!/usr/bin/env python3
"""
Deduplication Gate for the front-half pipeline.

Checks harvest candidates against four sources before promotion:
1. implementation_plans — work that was planned in the new system
2. work_request_history — work that was planned in the old system
3. intent_records — work captured as intent
4. git history — work that was actually committed

Usage:
    python3 dedup_gate.py [--dry-run] [--verbose] [--threshold 0.8]
"""

import json
import os
import sys
import subprocess
import psycopg2
from datetime import datetime
from dataclasses import dataclass, field

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "nexus",
    "user": "pguser",
    "password": "pgpass",
}

GIT_REPO = os.path.join(os.path.dirname(__file__), "..", "..", "..")


@dataclass
class DedupResult:
    """Result of checking a candidate against the gate."""
    candidate_id: str
    candidate_title: str
    is_duplicate: bool = False
    duplicate_of: str = ""  # Source + ID of the match
    match_type: str = ""  # implementation_plan, work_request, intent_record, git
    match_score: float = 0.0
    classification: str = "new"  # new, duplicate, in_progress, backlog


@dataclass
class GateStats:
    """Aggregate statistics for a gate run."""
    total: int = 0
    new: int = 0
    duplicate: int = 0
    in_progress: int = 0
    backlog: int = 0
    errors: int = 0
    results: list = field(default_factory=list)


def check_implementation_plans(cur, title: str, threshold: float = 0.8) -> dict | None:
    """Check if title matches an existing implementation plan."""
    cur.execute("""
        SELECT plan_number, title,
               similarity(title, %s) as score
        FROM nebula.implementation_plans
        WHERE similarity(title, %s) > %s
        ORDER BY score DESC
        LIMIT 1
    """, (title, title, threshold))
    row = cur.fetchone()
    if row:
        return {"source": "implementation_plan", "id": row[0], "title": row[1], "score": float(row[2])}
    return None


def check_work_request_history(cur, title: str, threshold: float = 0.8) -> dict | None:
    """Check if title matches a historical work request."""
    cur.execute("""
        SELECT id, plan_number, title,
               similarity(title, %s) as score
        FROM nebula.work_request_history
        WHERE similarity(title, %s) > %s
        ORDER BY score DESC
        LIMIT 1
    """, (title, title, threshold))
    row = cur.fetchone()
    if row:
        return {"source": "work_request_history", "id": row[0], "title": row[2], "score": float(row[3])}
    return None


def check_intent_records(cur, title: str, threshold: float = 0.8) -> dict | None:
    """Check if title matches an existing intent record."""
    cur.execute("""
        SELECT id, title,
               similarity(title, %s) as score
        FROM nebula.intent_records
        WHERE similarity(title, %s) > %s
        ORDER BY score DESC
        LIMIT 1
    """, (title, title, threshold))
    row = cur.fetchone()
    if row:
        return {"source": "intent_record", "id": str(row[0]), "title": row[1], "score": float(row[2])}
    return None


def check_git_history(title: str, min_commits: int = 3) -> dict | None:
    """Check if title matches git commit messages."""
    try:
        # Extract first 5 significant words from title
        words = [w for w in title.split() if len(w) > 3][:5]
        if not words:
            return None

        search_term = " ".join(words)
        result = subprocess.run(
            ["git", "log", "--oneline", f"--grep={search_term}", "--all"],
            capture_output=True, text=True, cwd=GIT_REPO, timeout=10
        )
        lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
        if len(lines) >= min_commits:
            return {"source": "git", "id": lines[0], "title": search_term, "score": 1.0, "commits": len(lines)}
    except Exception:
        pass
    return None


def classify_candidate(cur, title: str, threshold: float = 0.8) -> DedupResult:
    """Classify a candidate by checking all four sources."""
    result = DedupResult(candidate_id="", candidate_title=title)

    # Check in priority order: implementation_plans > work_requests > intent_records > git
    for check_fn, source_name in [
        (lambda: check_implementation_plans(cur, title, threshold), "implementation_plan"),
        (lambda: check_work_request_history(cur, title, threshold), "work_request_history"),
        (lambda: check_intent_records(cur, title, threshold), "intent_record"),
        (lambda: check_git_history(title), "git"),
    ]:
        match = check_fn()
        if match:
            result.is_duplicate = True
            result.duplicate_of = f"{match['source']}:{match['id']}"
            result.match_type = match["source"]
            result.match_score = match.get("score", 1.0)
            result.classification = "duplicate"
            return result

    result.classification = "new"
    return result


def run_gate(candidates: list[dict], dry_run: bool = False, verbose: bool = False,
             threshold: float = 0.8) -> GateStats:
    """Run the deduplication gate on a list of candidates."""
    stats = GateStats(total=len(candidates))

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    for i, candidate in enumerate(candidates):
        title = candidate.get("title", "")
        if not title:
            stats.backlog += 1
            continue

        try:
            result = classify_candidate(cur, title, threshold)
            result.candidate_id = candidate.get("id", str(i))
            stats.results.append(result)

            if result.is_duplicate:
                stats.duplicate += 1
                if verbose:
                    print(f"  DUP: {title[:60]} → {result.duplicate_of}")
            else:
                stats.new += 1
                if verbose:
                    print(f"  NEW: {title[:60]}")

        except Exception as e:
            stats.errors += 1
            if verbose:
                print(f"  ERROR: {title[:40]}: {e}", file=sys.stderr)

    cur.close()
    conn.close()

    return stats


def main():
    dry_run = "--dry-run" in sys.argv
    verbose = "--verbose" in sys.argv
    threshold = 0.8

    for i, arg in enumerate(sys.argv):
        if arg == "--threshold" and i + 1 < len(sys.argv):
            threshold = float(sys.argv[i + 1])

    # Load candidates from harvest_candidates table
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    cur.execute("""
        SELECT id, title, status
        FROM nebula.harvest_candidates
        WHERE status IN ('pending', 'linked', 'staged')
        LIMIT 200
    """)
    candidates = [
        {"id": str(row[0]), "title": row[1], "status": row[2]}
        for row in cur.fetchall()
    ]
    cur.close()
    conn.close()

    print(f"Loaded {len(candidates)} candidates (threshold={threshold})")
    print(f"Running deduplication gate...")

    stats = run_gate(candidates, dry_run=dry_run, verbose=verbose, threshold=threshold)

    print(f"\nResults:")
    print(f"  Total: {stats.total}")
    print(f"  New: {stats.new}")
    print(f"  Duplicate: {stats.duplicate}")
    print(f"  Errors: {stats.errors}")
    print(f"  Classification rate: {(stats.total - stats.errors) / stats.total * 100:.1f}%")


if __name__ == "__main__":
    main()
