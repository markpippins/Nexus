#!/usr/bin/env python3
"""
Resolve Backlog requirements that have evidence from history records.

For each Backlog requirement with a linked candidate:
1. Check if the candidate has linked agent_records via cross_references
2. If evidence exists, move the requirement to Done
3. This catches requirements that were implemented via "maximize code from chat"
"""

import subprocess
import sys

DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]


def psql(sql: str, timeout: int = 60) -> tuple[int, str]:
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, result.stdout.strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)"


def resolve_requirements():
    """Move Backlog requirements to Done when evidence exists."""
    sql = """
    UPDATE nebula.requirements r
    SET status = 'Done',
        completion_date = now()::text
    WHERE r.status = 'Backlog'
      AND r.candidate_id IS NOT NULL
      AND r.candidate_id::text IN (
          SELECT DISTINCT cr.target_id
          FROM nebula.cross_references cr
          WHERE cr.target_type = 'harvest_candidate'
            AND cr.source_type = 'agent_record'
            AND cr.rel_type = 'ag:evidences_candidate'
      );
    """
    rc, out = psql(sql, timeout=120)
    if rc == 0 and out:
        try:
            return int(out.replace("UPDATE ", "").strip())
        except ValueError:
            return 0
    return 0


def get_remaining():
    """Get requirement status counts."""
    sql = """
    SELECT status, count(*)::int
    FROM nebula.requirements
    GROUP BY status
    ORDER BY count(*) DESC;
    """
    rc, out = psql(sql)
    if rc == 0 and out:
        result = {}
        for line in out.splitlines():
            if "|" in line:
                parts = line.split("|")
                result[parts[0]] = int(parts[1])
        return result
    return {}


def main():
    print("Resolving Backlog requirements with evidence...")
    resolved = resolve_requirements()
    print(f"Resolved: {resolved}")
    
    remaining = get_remaining()
    print("\nRequirement status:")
    for status, count in remaining.items():
        print(f"  {status}: {count}")


if __name__ == "__main__":
    main()
