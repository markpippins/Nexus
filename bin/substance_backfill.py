#!/usr/bin/env python3
"""
Substance Backfill (Stage 1.5)

Finds harvests that have docklang discourse_units but no conversation
snapshot (i.e., no substance content) and segments them in place via
nebula.segment_harvest(id). This is the self-healing step for the old
corpus: harvests created before the auto-segment trigger was restored
(and any harvest whose snapshot insert failed) get their
conversation_snapshots + conversation_blocks backfilled WITHOUT
re-POSTing, which would create visible duplicate harvest rows (the
nebula.harvests view shows all versions per source_path).

Idempotent: nebula.segment_harvest skips harvests that already have a
snapshot. Safe to run on every pipeline cycle.

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate
    python3 bin/substance_backfill.py [--dry-run] [--limit N]
"""

import argparse
import logging
import subprocess
import sys

log = logging.getLogger("substance_backfill")

# Same connection pattern as batch_harvest_to_db.py (docker psql stdin pipe).
DOCKER_PSQL = [
    "docker", "exec", "-i", "pgvector_db",
    "psql", "-U", "pguser", "-d", "nexus",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stderr),
    ],
)


def psql(sql: str, timeout: int = 300) -> tuple[int, str]:
    """Run SQL via docker psql (stdin pipe), return (returncode, stdout)."""
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, result.stdout.strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)"


def find_gap_harvests(limit: int) -> list[str]:
    """Harvest ids with docklang discourse_units but no snapshot, oldest first."""
    rc, out = psql(
        f"""
        SELECT h.id
        FROM nebula.harvests h
        WHERE h.docklang IS NOT NULL
          AND h.docklang ? 'discourse_units'
          AND jsonb_array_length(h.docklang -> 'discourse_units') > 0
          AND NOT EXISTS (
              SELECT 1 FROM nebula.conversation_snapshots cs
              WHERE cs.conversation_id = h.id
          )
        ORDER BY h.created_at
        LIMIT {int(limit)}
        """
    )
    if rc != 0:
        log.error("Gap query failed: %s", out)
        return []
    return [line for line in out.splitlines() if line.strip()]


def backfill_one(harvest_id: str) -> str:
    """Segment one harvest; returns the created (or existing) snapshot id."""
    rc, out = psql(
        f"SELECT nebula.segment_harvest('{harvest_id}'::uuid);"
    )
    if rc != 0:
        return f"ERROR: {out}"
    return out or "(skipped/empty)"


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill substance content for harvests lacking snapshots")
    parser.add_argument("--dry-run", action="store_true", help="Report gaps without segmenting")
    parser.add_argument("--limit", type=int, default=50, help="Max harvests to backfill (default: 50)")
    args = parser.parse_args()

    gaps = find_gap_harvests(args.limit)
    log.info("Harvests lacking substance content (limit %d): %d", args.limit, len(gaps))

    if args.dry_run:
        for gid in gaps:
            log.info("  would segment %s", gid)
        return 0

    if not gaps:
        log.info("Nothing to backfill.")
        return 0

    done = 0
    for gid in gaps:
        result = backfill_one(gid)
        done += 1
        log.info("  [%d/%d] %s → %s", done, len(gaps), gid, result)

    # Final coverage check
    rc, out = psql(
        """
        SELECT count(*) FROM nebula.harvests h
        WHERE h.docklang IS NOT NULL
          AND h.docklang ? 'discourse_units'
          AND jsonb_array_length(h.docklang -> 'discourse_units') > 0
          AND NOT EXISTS (
              SELECT 1 FROM nebula.conversation_snapshots cs
              WHERE cs.conversation_id = h.id
          )
        """
    )
    log.info("Remaining harvests without substance content: %s", out if rc == 0 else "?")
    return 0


if __name__ == "__main__":
    sys.exit(main())
