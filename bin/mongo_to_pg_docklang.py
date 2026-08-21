#!/usr/bin/env python3
"""
MongoDB → PostgreSQL docklang backfill.

Reads structured conversation data from MongoDB (nexus.docklang) and
populates three PostgreSQL tables that the substance backfill script needs:

  1. nebula.harvests.docklang  — discourse_units derived from turns
  2. nebula.conversation_snapshots — one snapshot per harvest
  3. nebula.conversation_blocks — one block per turn

Matches MongoDB docs to PostgreSQL harvests by:
  MongoDB: file_metadata.source_file = PostgreSQL: source_filename

Each turn becomes:
  - A discourse_unit with heading, body, single block, provenance
  - A conversation_block with block_index, role, content_md
  - Blocks are sequential 0..N-1 across all turns

Idempotent: skips harvests that already have non-empty discourse_units.

Usage:
    python3 bin/mongo_to_pg_docklang.py [--dry-run] [--limit N] [--verbose]
"""

import argparse
import hashlib
import json
import logging
import subprocess
import sys
import uuid
from datetime import datetime, timezone

from pymongo import MongoClient

log = logging.getLogger("mongo_to_pg_docklang")

MONGO_URI = "mongodb://mongoUser:somePassword@localhost:27017/"
MONGO_DB = "nexus"
MONGO_COLL = "docklang"

DOCKER_PSQL = [
    "docker", "exec", "-i", "pgvector_db",
    "psql", "-U", "pguser", "-d", "nexus",
]

FOREVER_TS = "9999-12-31 00:00:00+00"
SEG_FOREVER_TS = "9999-12-31 23:59:59+00"


def psql(sql: str, timeout: int = 300) -> tuple[int, str]:
    """Run SQL via docker psql, return (returncode, stdout+stderr)."""
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A", "-v", "ON_ERROR_STOP=1"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, (result.stdout + result.stderr).strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)"


def content_hash(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def build_discourse_units(turns: list[dict]) -> list[dict]:
    """Transform MongoDB turns into discourse_units format.

    Each turn becomes one discourse_unit with one block.
    Block indices are sequential 0..N-1 across all units.
    """
    units = []
    block_offset = 0
    for i, turn in enumerate(turns):
        role = turn.get("role", "unknown")
        content = turn.get("content", "")
        if isinstance(content, list):
            # Some formats have content as array of parts
            content = "\n".join(
                p.get("text", "") if isinstance(p, dict) else str(p)
                for p in content
            )
        content = str(content)

        units.append({
            "heading": f"Turn {i + 1} — {role}",
            "body": content,
            "blocks": [
                {
                    "type": "paragraph",
                    "content": content,
                    "provenance": {"block_index": block_offset},
                }
            ],
            "provenance": {
                "role": role,
                "turn_index": i,
                "block_count": 1,
            },
        })
        block_offset += 1
    return units


def build_block_inserts(
    harvest_id: str, snapshot_id: str, turns: list[dict]
) -> str:
    """Generate INSERT SQL for conversation_blocks from turns."""
    rows = []
    for i, turn in enumerate(turns):
        role = turn.get("role", "unknown")
        content = turn.get("content", "")
        if isinstance(content, list):
            content = "\n".join(
                p.get("text", "") if isinstance(p, dict) else str(p)
                for p in content
            )
        content = str(content)
        block_id = str(uuid.uuid4())
        ch = content_hash(content)
        # Escape single quotes in content for SQL
        safe_content = content.replace("'", "''")
        rows.append(
            f"('{block_id}', '{harvest_id}', '{snapshot_id}', "
            f"{i}, 'paragraph', E'{safe_content}', '{ch}', '{role}')"
        )
    if not rows:
        return ""
    values = ",\n".join(rows)
    return f"""
    INSERT INTO nebula.conversation_blocks
        (id, conversation_id, snapshot_id, block_index, block_type,
         content_md, content_hash, role)
    VALUES {values}
    ;
    """


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Populate PostgreSQL docklang from MongoDB"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be done without writing")
    parser.add_argument("--limit", type=int, default=0,
                        help="Max harvests to process (0 = all)")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[logging.StreamHandler(sys.stderr)],
    )

    # Connect to MongoDB
    client = MongoClient(MONGO_URI)
    mongo_coll = client[MONGO_DB][MONGO_COLL]

    # Get all MongoDB docs with source_file
    mongo_docs = list(mongo_coll.find(
        {"file_metadata.source_file": {"$exists": True, "$ne": None}},
        {"_id": 0, "conversation_id": 1, "title": 1, "turns": 1,
         "source_format": 1, "model": 1, "file_metadata": 1,
         "turn_count": 1, "branch_count": 1, "branches": 1}
    ))
    log.info("MongoDB docs with source_file: %d", len(mongo_docs))

    # Build lookup: source_file → mongo doc
    # If multiple docs map to same source_file, take the one with most turns
    by_source_file: dict[str, dict] = {}
    for doc in mongo_docs:
        sf = doc.get("file_metadata", {}).get("source_file", "")
        if not sf:
            continue
        existing = by_source_file.get(sf)
        if existing is None or len(doc.get("turns", [])) > len(existing.get("turns", [])):
            by_source_file[sf] = doc

    log.info("Unique source_files: %d", len(by_source_file))

    # Get all PostgreSQL harvests with source_filename
    rc, out = psql("""
        SELECT id::text, source_filename, source_path, model
        FROM nebula.harvests
        WHERE source_filename IS NOT NULL
          AND (docklang IS NULL
               OR NOT (docklang ? 'discourse_units')
               OR jsonb_array_length(docklang -> 'discourse_units') = 0)
        ORDER BY source_filename
    """)
    if rc != 0:
        log.error("Failed to query harvests: %s", out)
        return 1

    harvests = []
    for line in out.splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) >= 4:
            harvests.append({
                "id": parts[0].strip(),
                "source_filename": parts[1].strip(),
                "source_path": parts[2].strip(),
                "model": parts[3].strip(),
            })

    log.info("Harvests needing docklang: %d", len(harvests))

    # Match and process
    matched = 0
    skipped_no_match = 0
    skipped_empty = 0

    # Filter to matched harvests
    to_process = []
    for h in harvests:
        sf = h["source_filename"]
        mongo = by_source_file.get(sf)
        if mongo is None:
            skipped_no_match += 1
            log.debug("No MongoDB match for: %s", sf)
            continue
        turns = mongo.get("turns", [])
        if not turns:
            skipped_empty += 1
            log.debug("No turns in MongoDB doc for: %s", sf)
            continue
        to_process.append((h, mongo, turns))

    log.info("Harvests to process: %d (no match: %d, empty: %d)",
             len(to_process), skipped_no_match, skipped_empty)

    if args.limit > 0:
        to_process = to_process[:args.limit]
        log.info("Limited to %d", len(to_process))

    if args.dry_run:
        for h, mongo, turns in to_process:
            log.info("  %s → %d turns", h["source_filename"], len(turns))
        return 0

    # Process in batches
    batch_sql_parts = []
    for h, mongo, turns in to_process:
        harvest_id = h["id"]
        snapshot_id = str(uuid.uuid4())

        # Build discourse_units
        units = build_discourse_units(turns)
        docklang = json.dumps({"discourse_units": units})

        # Escape for SQL
        safe_docklang = docklang.replace("'", "''")

        # 1) Update harvests.docklang
        batch_sql_parts.append(f"""
        UPDATE nebula.harvests
        SET docklang = '{safe_docklang}'::jsonb
        WHERE id = '{harvest_id}'::uuid;
        """)

        # 2) Create conversation_snapshot
        block_count = len(turns)
        batch_sql_parts.append(f"""
        INSERT INTO nebula.conversation_snapshots
            (id, conversation_id, snapshot_index, source_hash, capture_mode,
             block_count, created_by, created_at)
        VALUES (
            '{snapshot_id}'::uuid,
            '{harvest_id}'::uuid,
            0,
            '{content_hash(json.dumps([t.get("content", "") for t in turns]))}',
            'docklang_backfill',
            {block_count},
            'SYSTEM',
            now()
        );
        """)

        # 3) Create conversation_blocks
        batch_sql_parts.append(
            build_block_inserts(harvest_id, snapshot_id, turns)
        )

        matched += 1
        if matched % 50 == 0:
            log.info("  processed %d / %d", matched, len(to_process))

    # Execute all in one transaction
    if batch_sql_parts:
        full_sql = "BEGIN;\n" + "\n".join(batch_sql_parts) + "\nCOMMIT;"
        log.info("Executing %d SQL statements...", len(batch_sql_parts))
        rc, out = psql(full_sql, timeout=600)
        if rc != 0:
            log.error("SQL FAILED (rolled back): %s", out[:500])
            return 1
        log.info("Committed %d harvests.", matched)

    # Coverage report
    rc, out = psql("""
        SELECT
          (SELECT count(*) FROM nebula.harvests
           WHERE docklang ? 'discourse_units'
             AND jsonb_array_length(docklang -> 'discourse_units') > 0
          ) AS with_discourse_units,
          (SELECT count(*) FROM nebula.conversation_snapshots
           WHERE capture_mode = 'docklang_backfill'
          ) AS snapshots_created,
          (SELECT count(*) FROM nebula.conversation_blocks
           WHERE snapshot_id IN (
               SELECT id FROM nebula.conversation_snapshots
               WHERE capture_mode = 'docklang_backfill'
           )
          ) AS blocks_created,
          (SELECT count(*) FROM nebula.harvests
           WHERE source_filename IS NOT NULL
          ) AS total_harvests
    """)
    log.info("Coverage:\n%s", out if rc == 0 else "?")

    return 0


if __name__ == "__main__":
    sys.exit(main())
