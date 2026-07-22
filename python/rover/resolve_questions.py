#!/usr/bin/env python3
"""
Resolve open questions that now have evidence from ingested history records.

Batch-optimized: fetches all evidence in one query, then resolves.
"""

import json
import subprocess
import sys
from datetime import datetime

DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]

RESOLVABLE_CATEGORIES = {"MISSING_INFO", "SCOPE"}


def psql(sql: str, timeout: int = 60) -> tuple[int, str]:
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, result.stdout.strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)"


def batch_resolve():
    """Resolve all eligible questions in one SQL statement."""
    sql = """
    UPDATE nebula.open_questions oq
    SET status = 'RESOLVED',
        resolution = 'auto_resolved_by_history_ingestion',
        resolved_at = now(),
        resolved_by = 'planner-auto'
    WHERE oq.candidate_id::text IN (
        SELECT cr.target_id
        FROM nebula.cross_references cr
        WHERE cr.target_type = 'harvest_candidate'
          AND cr.source_type = 'agent_record'
          AND cr.rel_type = 'ag:evidences_candidate'
    )
    AND oq.status = 'OPEN'
    AND oq.category IN ('MISSING_INFO', 'SCOPE');
    """
    rc, out = psql(sql, timeout=120)
    if rc == 0 and out:
        # Parse "UPDATE N" from psql output
        try:
            return int(out.replace("UPDATE ", "").strip())
        except ValueError:
            return 0
    return 0


def get_remaining_open():
    """Count remaining open questions."""
    sql = "SELECT count(*)::int FROM nebula.open_questions WHERE status = 'OPEN';"
    rc, out = psql(sql)
    if rc == 0 and out:
        return int(out.strip())
    return 0


def main():
    print("Bulk resolving open questions with evidence...")
    resolved = batch_resolve()
    remaining = get_remaining_open()
    print(f"Resolved: {resolved}")
    print(f"Remaining open: {remaining}")


if __name__ == "__main__":
    main()
