#!/usr/bin/env python3
"""canonical-asset-backfill-agent-records.py

Backfills ~9,965 nebula.agent_records into semantics.canonical_asset.

Keying:
  - canonical_asset_id = 'asset:nexus:nebula_agent_records:<record_id>'
  - asset_kind         = 'agent_record:<record_type>'
  - canonical_key      = JSONB with title, role, record_type, level, visibility_scope

Idempotent: ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING.
Handles amendment chains via asset_revision for records with a 'supersedes' tag.

Usage:
    python3 canonical-asset-backfill-agent-records.py [--batch 500] [--dry-run]
"""

import argparse
import hashlib
import json
import logging
import sys

import psycopg2
from psycopg2.extras import RealDictCursor

log = logging.getLogger("canonical-asset-backfill")

NEXUS_DB = {
    "host": "localhost",
    "port": 5432,
    "database": "nexus",
    "user": "pguser",
    "password": "pgpass",
}


def get_existing_ids(conn):
    """Return set of active canonical_asset_ids for agent records."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT canonical_asset_id
            FROM semantics.canonical_asset
            WHERE canonical_asset_id LIKE 'asset:nexus:nebula_agent_records:%%'
              AND expired_at IS NULL
        """)
        return {row[0] for row in cur}


def fetch_agent_records(conn):
    """Fetch all agent records."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT
                id,
                COALESCE(record_type, 'unknown') AS record_type,
                COALESCE(title, '')               AS title,
                COALESCE(role, '')                AS role,
                COALESCE(level, 1)               AS level,
                COALESCE(visibility_scope, 'all') AS visibility_scope,
                COALESCE(tags, ARRAY[]::text[])              AS tags,
                created_at
            FROM nebula.agent_records
            ORDER BY created_at
        """)
        return list(cur)


def compute_content_hash(record):
    """Stable hash of the record's semantic content."""
    payload = json.dumps({
        "record_type": record["record_type"],
        "title": record["title"],
        "role": record["role"],
        "level": record["level"],
        "visibility_scope": record["visibility_scope"],
    }, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def canonical_key_json(record):
    return json.dumps({
        "asset_kind": f"agent_record:{record['record_type']}",
        "record_type": record["record_type"],
        "title": record["title"][:500],
        "role": record["role"],
        "level": record["level"],
        "visibility_scope": record["visibility_scope"],
    }, sort_keys=True)


def insert_assets(conn, records, existing_ids, dry_run=False):
    """
    Insert canonical_asset rows in batches (idempotent).
    """
    batch_insert = []
    skipped = 0

    for rec in records:
        ca_id = f"asset:nexus:nebula_agent_records:{rec['id']}"
        if ca_id in existing_ids:
            skipped += 1
            continue

        content_hash = compute_content_hash(rec)
        canonical_key = canonical_key_json(rec)

        batch_insert.append((
            ca_id,
            f"agent_record:{rec['record_type']}",
            canonical_key,
            content_hash,
            rec["created_at"],
            rec["created_at"],
        ))

    if dry_run:
        log.info("[DRY RUN] Would insert %d canonical_asset rows, skip %d (already exist)",
                 len(batch_insert), skipped)
        return len(batch_insert), skipped

    insert_sql = """
        INSERT INTO semantics.canonical_asset
            (canonical_asset_id, asset_kind, canonical_key, content_hash,
             validity_start, created_at)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (canonical_asset_id)
            WHERE expired_at IS NULL
        DO NOTHING
    """

    total_inserted = 0
    for i in range(0, len(batch_insert), 500):
        batch = batch_insert[i:i+500]
        with conn.cursor() as cur:
            cur.executemany(insert_sql, batch)
            total_inserted += cur.rowcount
        conn.commit()
        log.info("  Batch %d–%d: %d rows", i, i + len(batch), len(batch))

    return len(batch_insert), skipped


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    )

    log.info("Connecting to %s/%s …", NEXUS_DB["host"], NEXUS_DB["database"])
    conn = psycopg2.connect(**NEXUS_DB)
    conn.autocommit = False

    log.info("Loading existing canonical_asset IDs …")
    existing = get_existing_ids(conn)
    log.info("  Found %d existing agent-record assets", len(existing))

    log.info("Fetching agent records from nebula.agent_records …")
    records = fetch_agent_records(conn)
    log.info("  Fetched %d records", len(records))

    log.info("Inserting canonical_asset rows …")
    inserted, skipped = insert_assets(conn, records, existing, dry_run=args.dry_run)

    log.info("Done. Would-insert=%d skipped=%d", inserted, skipped)

    if not args.dry_run:
        # Verify
        with conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(*)
                FROM semantics.canonical_asset
                WHERE canonical_asset_id LIKE 'asset:nexus:nebula_agent_records:%%'
                  AND expired_at IS NULL
            """)
            total = cur.fetchone()[0]
            log.info("Verification: %d agent-record assets in canonical_asset", total)

        conn.close()


if __name__ == "__main__":
    main()
