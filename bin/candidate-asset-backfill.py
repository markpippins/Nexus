#!/usr/bin/env python3
"""candidate-asset-backfill.py

Backfills authoritative canonical asset identities for harvest candidates
(DBA to-do item 1: "Candidate asset_id backfill").

Currently every row in `nebula.harvest_candidates_history` has asset_id = NULL.
This script:

  1. Creates one `semantics.canonical_asset` row per candidate keyed
     `asset:nexus:nebula_harvest_candidates:<candidate_id>` with
     asset_kind = 'candidate' (same keying convention the earlier bulk
     import used — see the ~3,370 pre-existing 'candidate' assets).
  2. Creates one `semantics.asset_revision` row per candidate
     (`:rev:1`) carrying content_hash + source_hash (the candidate UUID),
     mirroring the agent-record asset backfill (dba-agent-record-backfill).
  3. Sets `nebula.harvest_candidates_history.asset_id` to the canonical
     asset's id, satisfying the existing FK on the physical history table
     (the `nebula.harvest_candidates` view exposes it for current rows).

Idempotent: canonical_asset upserts on (canonical_asset_id) where
expired_at IS NULL; asset_revision upserts on (revision_id) where
expired_at IS NULL; asset_id updates are skipped when already set.

Usage:
    python3 candidate-asset-backfill.py [--dry-run] [--batch 500]
"""

import argparse
import hashlib
import json
import logging
import sys

import psycopg2
from psycopg2.extras import RealDictCursor

log = logging.getLogger("candidate-asset-backfill")

NEXUS_DB = {
    "host": "localhost",
    "port": 5432,
    "database": "nexus",
    "user": "pguser",
    "password": "pgpass",
}

CREATED_BY = "engineer-candidate-asset-backfill"


def fetch_candidates(conn):
    """Fetch all harvest candidates (history rows are the physical store)."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
                id,
                COALESCE(title, '')                AS title,
                COALESCE(type, 'requirement')      AS type,
                status,
                harvest_id,
                system_id,
                subsystem_id,
                created_at
            FROM nebula.harvest_candidates_history
            ORDER BY created_at, id
            """
        )
        return list(cur)


def get_existing_assets(conn):
    """Set of active canonical_asset_ids for candidates."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT canonical_asset_id
            FROM semantics.canonical_asset
            WHERE canonical_asset_id LIKE 'asset:nexus:nebula_harvest_candidates:%'
              AND expired_at IS NULL
            """
        )
        return {row[0] for row in cur}


def compute_content_hash(cand):
    """Stable hash of the candidate's canonical metadata."""
    payload = json.dumps(
        {
            "title": cand["title"],
            "type": cand["type"],
            "status": cand["status"],
            "harvest_id": str(cand["harvest_id"]),
            "system_id": str(cand["system_id"]) if cand["system_id"] else None,
            "subsystem_id": str(cand["subsystem_id"]) if cand["subsystem_id"] else None,
        },
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def canonical_key_json(cand):
    return json.dumps(
        {
            "asset_kind": "candidate",
            "title": cand["title"][:500],
            "type": cand["type"],
            "status": cand["status"],
            "harvest_id": str(cand["harvest_id"]),
            "system_id": str(cand["system_id"]) if cand["system_id"] else None,
            "subsystem_id": str(cand["subsystem_id"]) if cand["subsystem_id"] else None,
        },
        sort_keys=True,
    )


def backfill(conn, candidates, existing_assets, dry_run=False):
    """Create canonical_asset + asset_revision rows, then link asset_id."""
    to_create = []
    for cand in candidates:
        ca_id = f"asset:nexus:nebula_harvest_candidates:{cand['id']}"
        if ca_id in existing_assets:
            continue
        to_create.append((cand, ca_id))

    if dry_run:
        log.info("[DRY RUN] Would create %d candidate assets (+revisions), %d already exist",
                 len(to_create), len(candidates) - len(to_create))
        return len(to_create), 0

    created = 0
    for i in range(0, len(to_create), 500):
        batch = to_create[i:i + 500]
        with conn.cursor() as cur:
            for cand, ca_id in batch:
                ch = compute_content_hash(cand)
                cur.execute(
                    """
                    INSERT INTO semantics.canonical_asset
                        (canonical_asset_id, asset_kind, canonical_key, content_hash,
                         validity_start, created_at)
                    VALUES (%s, 'candidate', %s::jsonb, %s, %s, %s)
                    ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL
                    DO NOTHING
                    RETURNING id
                    """,
                    (ca_id, canonical_key_json(cand), ch, cand["created_at"], cand["created_at"]),
                )
                row = cur.fetchone()
                if row is None:
                    continue  # raced with a concurrent run
                asset_uuid = row[0]
                # Mirror the agent-record revision shape (rev:1).
                cur.execute(
                    """
                    INSERT INTO semantics.asset_revision
                        (revision_id, asset_id, content_hash, source_hash,
                         recording_start, created_by, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, now())
                    ON CONFLICT (revision_id) WHERE expired_at IS NULL
                    DO NOTHING
                    """,
                    (
                        f"{ca_id}:rev:1",
                        asset_uuid,
                        ch,
                        str(cand["id"]),
                        cand["created_at"],
                        CREATED_BY,
                    ),
                )
                # Link the history row to its canonical asset (skip if already set).
                cur.execute(
                    """
                    UPDATE nebula.harvest_candidates_history
                    SET asset_id = %s
                    WHERE id = %s AND asset_id IS NULL
                    """,
                    (asset_uuid, cand["id"]),
                )
                created += 1
        conn.commit()
        log.info("  Batch %d–%d: %d candidates", i, i + len(batch), len(batch))

    return created, len(to_create) - created


def verify(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                (SELECT count(*) FROM nebula.harvest_candidates_history)                      AS total_candidates,
                (SELECT count(*) FROM nebula.harvest_candidates_history WHERE asset_id IS NOT NULL) AS with_asset,
                (SELECT count(*) FROM semantics.canonical_asset
                  WHERE asset_kind = 'candidate'
                    AND canonical_asset_id LIKE 'asset:nexus:nebula_harvest_candidates:%'
                    AND expired_at IS NULL)                                                  AS candidate_assets,
                (SELECT count(*) FROM semantics.asset_revision
                  WHERE revision_id LIKE 'asset:nexus:nebula_harvest_candidates:%:rev:1'
                    AND expired_at IS NULL)                                                  AS revisions,
                (SELECT count(*) FROM nebula.harvest_candidates_history h
                   WHERE h.asset_id IS NOT NULL
                     AND NOT EXISTS (
                       SELECT 1 FROM semantics.canonical_asset ca
                       WHERE ca.id = h.asset_id AND ca.expired_at IS NULL))                 AS dangling
            """
        )
        row = cur.fetchone()
        return {
            "total_candidates": row[0],
            "with_asset": row[1],
            "candidate_assets": row[2],
            "revisions": row[3],
            "dangling": row[4],
        }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s %(message)s")

    log.info("Connecting to %s/%s …", NEXUS_DB["host"], NEXUS_DB["database"])
    conn = psycopg2.connect(**NEXUS_DB)
    conn.autocommit = False

    candidates = fetch_candidates(conn)
    log.info("  Fetched %d candidates", len(candidates))

    existing = get_existing_assets(conn)
    log.info("  %d candidate assets already exist", len(existing))

    created, skipped = backfill(conn, candidates, existing, dry_run=args.dry_run)
    log.info("Created=%d skipped=%d", created, skipped)

    if not args.dry_run:
        stats = verify(conn)
        log.info("Verification: %s", stats)
        conn.close()


if __name__ == "__main__":
    main()
