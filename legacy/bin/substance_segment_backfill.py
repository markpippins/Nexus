#!/usr/bin/env python3
"""
Substance Segment Backfill (Stage 2)

Creates the segment-set layer from harvests that already have
conversation_snapshots + conversation_blocks + docklang discourse_units:

  1. segments_history   - one row per discourse unit (block range per unit,
                          computed via cumulative block counts; block indices
                          are sequential 0..N-1 across units as assigned by
                          nebula.segment_harvest).
  2. segment_sets       - one set per harvest (conversation) with units.
  3. segment_set_members- every unit segment member of its harvest's set.
  4. domain links       - candidate_segment_sets (via harvest_candidates),
                          requirement_segment_sets (via requirements.candidate_id).

Sentinel-aware: segments_history uses '9999-12-31 23:59:59+00';
segment_sets / members / link tables use '9999-12-31 00:00:00+00'.

Idempotent + atomic: the whole batch runs in ONE transaction (all-or-nothing);
harvests that already have segments are excluded at target-selection time.

Usage:
    python3 bin/substance_segment_backfill.py [--dry-run] [--limit N]
"""

import argparse
import logging
import subprocess
import sys

log = logging.getLogger("substance_segment_backfill")

# Same connection pattern as batch_harvest_to_db.py / substance_backfill.py
DOCKER_PSQL = [
    "docker", "exec", "-i", "pgvector_db",
    "psql", "-U", "pguser", "-d", "nexus",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)],
)


def psql(sql: str, timeout: int = 900) -> tuple[int, str]:
    """Run SQL via docker psql (stdin pipe), return (returncode, stdout)."""
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A", "-v", "ON_ERROR_STOP=1"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, (result.stdout + result.stderr).strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)"


SEG_HISTORY = "'9999-12-31 23:59:59+00'::timestamptz"
SEG_FOREVER = "'9999-12-31 00:00:00+00'::timestamptz"

TARGETS_CTE = """
WITH targets AS (
    SELECT DISTINCT h.id AS harvest_id
    FROM nebula.harvests h
    JOIN nebula.conversation_snapshots cs ON cs.conversation_id = h.id
    WHERE h.docklang IS NOT NULL
      AND h.docklang ? 'discourse_units'
      AND jsonb_array_length(h.docklang -> 'discourse_units') > 0
      AND NOT EXISTS (
          SELECT 1 FROM nebula.segments_history sh
          WHERE sh.snapshot_id = cs.id
      )
)
"""


def target_harvests(limit: int) -> str:
    """Live harvests with docklang units + snapshot, lacking segments yet."""
    return f"""
        {TARGETS_CTE}
        SELECT t.harvest_id FROM targets t ORDER BY t.harvest_id LIMIT {int(limit)}
    """


def projected_counts() -> str:
    """Dry-run projections for the current target set."""
    return f"""
        {TARGETS_CTE}
        SELECT 'segments', count(*) FROM nebula.harvests h
          CROSS JOIN LATERAL jsonb_array_elements(h.docklang -> 'discourse_units') du
          JOIN targets t ON t.harvest_id = h.id
        UNION ALL
        SELECT 'sets', count(*) FROM targets
        UNION ALL
        SELECT 'candidate_links', count(*) FROM nebula.harvest_candidates hc
          JOIN targets t ON t.harvest_id = hc.harvest_id
         WHERE hc.valid_until > now()
        UNION ALL
        SELECT 'requirement_links', count(*) FROM nebula.requirements r
          JOIN nebula.harvest_candidates hc ON hc.id = r.candidate_id
          JOIN targets t ON t.harvest_id = hc.harvest_id
         WHERE r.valid_until > now()
    """


def build_backfill_sql(harvest_ids: list[str]) -> str:
    """All four steps in one transaction (atomic, resumable)."""
    ids = ",".join(f"'{x}'::uuid" for x in harvest_ids)
    return f"""
    BEGIN;

    -- 1) segments_history: one row per discourse unit
    INSERT INTO nebula.segments_history
        (id, conversation_id, snapshot_id,
         start_block_id, end_block_id,
         start_block_index, end_block_index,
         segment_type, state, source,
         title, notes_md, created_by,
         as_of_dt, expiration_dt)
    SELECT
        gen_random_uuid() AS id,
        h.id AS conversation_id,
        cs.id AS snapshot_id,
        cb1.id AS start_block_id,
        cb2.id AS end_block_id,
        r.start_index AS start_block_index,
        r.start_index + r.block_count - 1 AS end_block_index,
        'discussion' AS segment_type,
        'ACTIVE' AS state,
        'HARVEST' AS source,
        r.heading AS title,
        r.body AS notes_md,
        'SYSTEM' AS created_by,
        now() AS as_of_dt,
        {SEG_HISTORY} AS expiration_dt
    FROM (
        SELECT
            u.harvest_id,
            u.unit_idx,
            u.block_count,
            u.heading,
            u.body,
            COALESCE(sum(u.block_count) OVER (
                PARTITION BY u.harvest_id
                ORDER BY u.unit_idx
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ), 0) AS start_index
        FROM (
            SELECT
                h.id AS harvest_id,
                du.ord AS unit_idx,
                jsonb_array_length(du.du -> 'blocks') AS block_count,
                du.du #>> '{{heading}}' AS heading,
                du.du #>> '{{body}}' AS body
            FROM nebula.harvests h
            JOIN LATERAL jsonb_array_elements(
                h.docklang -> 'discourse_units'
            ) WITH ORDINALITY AS du(du, ord) ON true
            WHERE h.id IN ({ids})
              AND h.docklang ? 'discourse_units'
        ) u
    ) r
    JOIN nebula.harvests h ON h.id = r.harvest_id
    JOIN nebula.conversation_snapshots cs ON cs.conversation_id = h.id
    JOIN nebula.conversation_blocks cb1
         ON cb1.snapshot_id = cs.id AND cb1.block_index = r.start_index
    JOIN nebula.conversation_blocks cb2
         ON cb2.snapshot_id = cs.id
        AND cb2.block_index = r.start_index + r.block_count - 1;

    -- 2) segment_sets: one per harvest
    INSERT INTO nebula.segment_sets
        (name, description, status, metadata, valid_from, valid_until)
    SELECT
        COALESCE(h.source_filename, 'harvest-' || h.id::text),
        h.source_path,
        'active',
        jsonb_build_object('harvest_id', h.id::text, 'kind', 'HARVEST'),
        now(),
        {SEG_FOREVER}
    FROM nebula.harvests h
    WHERE h.id IN ({ids})
      AND NOT EXISTS (
          SELECT 1 FROM nebula.segment_sets s
          WHERE s.metadata->>'harvest_id' = h.id::text
      );

    -- 3) segment_set_members: every unit segment of a harvest belongs to its set
    INSERT INTO nebula.segment_set_members
        (segment_set_id, segment_id, ordinal, included, valid_from, valid_until)
    SELECT
        s.id,
        sh.id,
        r.unit_idx,
        true,
        now(),
        {SEG_FOREVER}
    FROM (
        SELECT
            u.harvest_id,
            u.unit_idx,
            jsonb_array_length(u.du -> 'blocks') AS block_count,
            COALESCE(sum(jsonb_array_length(u.du -> 'blocks')) OVER (
                PARTITION BY u.harvest_id
                ORDER BY u.unit_idx
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ), 0) AS start_index
        FROM (
            SELECT
                h.id AS harvest_id,
                du.ord AS unit_idx,
                du.du
            FROM nebula.harvests h
            JOIN LATERAL jsonb_array_elements(
                h.docklang -> 'discourse_units'
            ) WITH ORDINALITY AS du(du, ord) ON true
            WHERE h.id IN ({ids})
              AND h.docklang ? 'discourse_units'
        ) u
    ) r
    JOIN nebula.segment_sets s ON s.metadata->>'harvest_id' = r.harvest_id::text
    JOIN nebula.conversation_snapshots cs ON cs.conversation_id = r.harvest_id
    JOIN nebula.segments_history sh
         ON sh.snapshot_id = cs.id AND sh.start_block_index = r.start_index;

    -- 4) domain links
    INSERT INTO nebula.candidate_segment_sets
        (candidate_id, segment_set_id, role, active, valid_from, valid_until)
    SELECT hc.id, s.id, 'primary', true, now(), {SEG_FOREVER}
    FROM nebula.harvest_candidates hc
    JOIN nebula.segment_sets s ON s.metadata->>'harvest_id' = hc.harvest_id::text
    WHERE hc.harvest_id IN ({ids})
      AND hc.valid_until > now()
      AND NOT EXISTS (
          SELECT 1 FROM nebula.candidate_segment_sets cl
          WHERE cl.candidate_id = hc.id AND cl.segment_set_id = s.id
      );

    INSERT INTO nebula.requirement_segment_sets
        (requirement_id, segment_set_id, role, active, valid_from, valid_until)
    SELECT r.id, s.id, 'primary', true, now(), {SEG_FOREVER}
    FROM nebula.requirements r
    JOIN nebula.harvest_candidates hc ON hc.id = r.candidate_id
    JOIN nebula.segment_sets s ON s.metadata->>'harvest_id' = hc.harvest_id::text
    WHERE hc.harvest_id IN ({ids})
      AND r.valid_until > now()
      AND NOT EXISTS (
          SELECT 1 FROM nebula.requirement_segment_sets cl
          WHERE cl.requirement_id = r.id AND cl.segment_set_id = s.id
      );

    COMMIT;
    """


def coverage_report() -> None:
    rc, out = psql("""
    SELECT
      (SELECT count(*) FROM nebula.segments_history
       WHERE expiration_dt = '9999-12-31 23:59:59+00') AS live_segments,
      (SELECT count(*) FROM nebula.segment_sets
       WHERE valid_until > now()) AS live_sets,
      (SELECT count(*) FROM nebula.segment_set_members
       WHERE valid_until > now() AND included) AS live_members,
      (SELECT count(*) FROM nebula.candidate_segment_sets) AS candidate_links,
      (SELECT count(*) FROM nebula.requirement_segment_sets) AS requirement_links
    """)
    log.info("Coverage after run: %s", out if rc == 0 else "?")


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill substance segment-set layer")
    parser.add_argument("--dry-run", action="store_true",
                        help="Report targets + projections without writing")
    parser.add_argument("--limit", type=int, default=5000,
                        help="Max harvests per batch (default 5000)")
    args = parser.parse_args()

    rc, out = psql(target_harvests(args.limit))
    if rc != 0:
        log.error("target query failed: %s", out)
        return 1
    harvests = [x for x in out.splitlines() if x.strip()]
    log.info("Harvests missing segments (limit %d): %d", args.limit, len(harvests))

    if args.dry_run:
        rc, proj = psql(projected_counts())
        if rc != 0:
            log.error("projection query failed: %s", proj)
            return 1
        log.info("Projected insert (dry-run):")
        for line in proj.splitlines():
            if line.strip():
                k, v = line.split("|")
                log.info("  %-20s %s", k, v)
        return 0

    if not harvests:
        log.info("Nothing to backfill.")
        coverage_report()
        return 0

    sql = build_backfill_sql(harvests)
    rc, out = psql(sql)
    if rc != 0:
        log.error("Backfill FAILED (transaction rolled back): %s", out)
        return 1
    log.info("Backfill committed (%d harvests).", len(harvests))
    coverage_report()
    return 0


if __name__ == "__main__":
    sys.exit(main())
