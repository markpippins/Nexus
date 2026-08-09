#!/usr/bin/env python3
"""
Ingest .conduit-data/WORK_REQUESTS/ JSON files into nebula.work_request_history.

Phase 1 of Plan 1265: Front-Half Pipeline Redesign.
Captures 1880+ historical work requests from the old filesystem pipeline
so the deduplication gate can recognize previously-planned work.

Usage:
    python3 ingest_conduit_data.py [--dry-run] [--verbose]
"""

import json
import os
import sys
import glob
import psycopg2
from datetime import datetime

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "nexus",
    "user": "pguser",
    "password": "pgpass",
}

# .conduit-data deleted 2026-08-09; mirror is the posterity home
WR_DIR = os.path.join(os.path.dirname(__file__), "..", "audit", "CONDUIT_DATA", "WORK_REQUESTS")


def load_work_requests(wr_dir: str) -> list[dict]:
    """Load all work request JSON files from the directory."""
    files = sorted(glob.glob(os.path.join(wr_dir, "*.json")))
    requests = []
    for f in files:
        try:
            with open(f) as fh:
                data = json.load(fh)
            requests.append(data)
        except (json.JSONDecodeError, IOError) as e:
            print(f"  WARN: Failed to load {os.path.basename(f)}: {e}", file=sys.stderr)
    return requests


def extract_fields(data: dict) -> dict:
    """Extract flat fields from a work request JSON structure."""
    intent = data.get("intent", {})
    execution = data.get("execution_state", {})
    metadata = data.get("metadata", {})
    lineage = data.get("lineage", {})

    # Derive plan number from lineage
    plan_number = None
    derived_from = lineage.get("derived_from", [])
    if derived_from:
        plan_number = str(derived_from[0])

    # Title = desired_outcome (most concise description)
    title = intent.get("desired_outcome", "") or intent.get("problem_statement", "")

    return {
        "id": data.get("id", ""),
        "plan_number": plan_number,
        "title": title[:500],  # Truncate for safety
        "goal": intent.get("problem_statement", ""),
        "status": execution.get("status", "pending"),
        "domain": intent.get("domain", ""),
        "priority": intent.get("priority", ""),
        "created_at": metadata.get("created_at"),
        "updated_at": metadata.get("updated_at"),
        "agent_id": metadata.get("agent_id", ""),
        "model": metadata.get("model", ""),
        "session_id": metadata.get("session_id", ""),
        "raw_json": data,
    }


def ingest(requests: list[dict], dry_run: bool = False, verbose: bool = False) -> dict:
    """Ingest extracted work requests into the database."""
    stats = {"total": len(requests), "inserted": 0, "skipped": 0, "errors": 0}

    if dry_run:
        print(f"[DRY RUN] Would insert {len(requests)} work requests")
        if verbose:
            for r in requests[:5]:
                print(f"  {r['id']}: {r['title'][:60]}")
            if len(requests) > 5:
                print(f"  ... and {len(requests) - 5} more")
        return stats

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    insert_sql = """
        INSERT INTO nebula.work_request_history
            (id, plan_number, title, goal, status, domain, priority,
             created_at, updated_at, agent_id, model, session_id, raw_json)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            goal = EXCLUDED.goal,
            updated_at = EXCLUDED.updated_at,
            raw_json = EXCLUDED.raw_json
    """

    for req in requests:
        try:
            cur.execute(insert_sql, (
                req["id"], req["plan_number"], req["title"], req["goal"],
                req["status"], req["domain"], req["priority"],
                req["created_at"], req["updated_at"], req["agent_id"],
                req["model"], req["session_id"], json.dumps(req["raw_json"]),
            ))
            stats["inserted"] += 1
        except Exception as e:
            stats["errors"] += 1
            if verbose:
                print(f"  ERROR: {req['id']}: {e}", file=sys.stderr)

    conn.commit()
    cur.close()
    conn.close()

    return stats


def main():
    dry_run = "--dry-run" in sys.argv
    verbose = "--verbose" in sys.argv

    print(f"Loading work requests from {WR_DIR}...")
    requests = load_work_requests(WR_DIR)
    print(f"Loaded {len(requests)} work requests")

    extracted = [extract_fields(r) for r in requests]

    # Show summary
    plan_numbers = set(r["plan_number"] for r in extracted if r["plan_number"])
    print(f"Unique plan numbers: {len(plan_numbers)}")
    print(f"Statuses: {dict((s, sum(1 for r in extracted if r['status'] == s)) for s in set(r['status'] for r in extracted))}")

    stats = ingest(extracted, dry_run=dry_run, verbose=verbose)
    print(f"\nResult: {stats}")


if __name__ == "__main__":
    main()
