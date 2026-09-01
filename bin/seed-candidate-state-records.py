#!/usr/bin/env python3
"""seed-candidate-state-records.py

Creates one deterministic Shrapnel state record per harvest candidate
(DBA to-do item 2: "Candidate-state record seeding").

Shape (per DBA directive 1c63d588): a `shrapnel.object_instance` whose
members are the Analyst seed set (5232aef7) via `shrapnel.field` +
`shrapnel.object_attribute_value` + `shrapnel.value` shell +
`shrapnel.value_boolean`/`shrapnel.value_string` extension rows.

Seed semantics (fail-closed, per 5232aef7):
  - `asset_id`            — always written (the canonical asset id string)
  - `system_mapped`       — written for every candidate: true iff the
                            candidate's own system_id + subsystem_id are
                            both non-null (authoritative from the row);
                            false otherwise (authoritative absence).
  - `has_open_questions`  — written for every candidate: true iff the
                            candidate's open_questions array is non-empty;
                            false when it is an empty array (authoritative).
  - `partial_implementation`, `detailed_analysis`, `inspection_or_ir_exists`,
    `sandbox_scaffolded`  — NOT written by this seed: their sources
    (candidate↔evidence linkage, inspection/IR registry, sandbox registry)
    do not exist yet. Absent means "not established", never guessed.

Idempotent: a candidate's state record is located by its asset_id member;
already-seeded candidates are skipped. Fields upsert on property_name.

Usage:
    python3 seed-candidate-state-records.py [--dry-run] [--batch 500]
"""

import argparse
import json
import logging

import psycopg2
from psycopg2.extras import RealDictCursor

log = logging.getLogger("candidate-state-seed")

NEXUS_DB = {
    "host": "localhost",
    "port": 5432,
    "database": "nexus",
    "user": "pguser",
    "password": "pgpass",
}

CREATED_BY = "engineer-candidate-state-seed"

# Field property_name -> (label, field_type_code). Codes from
# shrapnel.field_type: 2=String, 4=Boolean.
STATE_FIELDS = [
    ("asset_id",              "asset_id",              2),
    ("partial_implementation", "partial_implementation", 4),
    ("detailed_analysis",      "detailed_analysis",      4),
    ("inspection_or_ir_exists", "inspection_or_ir_exists", 4),
    ("system_mapped",          "system_mapped",          4),
    ("has_open_questions",     "has_open_questions",     4),
    ("sandbox_scaffolded",     "sandbox_scaffolded",     4),
]


def ensure_fields(conn):
    """Upsert the shrapnel.field rows for the state members. Returns
    {property_name: field_id}."""
    field_ids = {}
    with conn.cursor() as cur:
        for idx, (name, prop, ftype) in enumerate(STATE_FIELDS, start=1):
            # shrapnel.field has a BEFORE UPDATE trigger (set_updated_at) that
            # references a non-existent updated_at column, so any UPDATE on the
            # table fails. Fields are effectively immutable; use DO NOTHING on
            # conflict and resolve the id separately (no UPDATE path).
            cur.execute(
                """
                INSERT INTO shrapnel.field
                    (name, property_name, label, field_type_code, field_index, is_calculated)
                VALUES (%s, %s, %s, %s, %s, false)
                ON CONFLICT (property_name) DO NOTHING
                """,
                (name, prop, name, ftype, 100 + idx),
            )
            cur.execute(
                "SELECT id FROM shrapnel.field WHERE property_name = %s",
                (prop,),
            )
            row = cur.fetchone()
            if row is None:
                raise RuntimeError(f"field {prop} missing after upsert")
            field_ids[prop] = row[0]
    conn.commit()
    return field_ids


def find_state_object(conn, asset_id_str):
    """Locate an existing state record for the candidate by its asset_id
    member (the idempotency key). Returns object id or None."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT o.id
            FROM shrapnel.object_instance o
            JOIN shrapnel.object_attribute_value oav ON oav.object_id = o.id
            JOIN shrapnel.field f ON f.id = oav.field_id
            JOIN shrapnel.value v ON v.id = oav.value_id
            JOIN shrapnel.value_string vs ON vs.id = v.id
            WHERE f.property_name = 'asset_id' AND vs.value = %s
            LIMIT 1
            """,
            (asset_id_str,),
        )
        row = cur.fetchone()
        return row[0] if row else None


def fetch_candidates(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT h.id, h.title, h.system_id, h.subsystem_id, h.open_questions,
                   ca.canonical_asset_id
            FROM nebula.harvest_candidates_history h
            JOIN semantics.canonical_asset ca
              ON ca.canonical_asset_id = 'asset:nexus:nebula_harvest_candidates:' || h.id::text
             AND ca.expired_at IS NULL
            ORDER BY h.created_at, h.id
            """
        )
        return list(cur)


def member_values(cand):
    """Compute the deterministic seed members (fail-closed). Returns
    {property_name: (field_type_code, python_value)}."""
    out = {}
    out["asset_id"] = (2, cand["canonical_asset_id"])
    mapped = cand["system_id"] is not None and cand["subsystem_id"] is not None
    out["system_mapped"] = (4, bool(mapped))
    oq = cand["open_questions"]
    if isinstance(oq, list):
        out["has_open_questions"] = (4, bool(oq))
    else:
        # jsonb that isn't a list — treat as authoritative empty (absent
        # would also be fine; the column is always a jsonb array in seed data)
        out["has_open_questions"] = (4, False)
    return out


def seed_candidate(conn, cand, field_ids, dry_run=False):
    """Seed one candidate's state record. Returns 'created'|'existing'|'skipped'."""
    asset_id_str = cand["canonical_asset_id"]
    existing = find_state_object(conn, asset_id_str)
    if existing is not None:
        return "existing"

    members = member_values(cand)
    if dry_run:
        return "created"

    with conn.cursor() as cur:
        cur.execute("INSERT INTO shrapnel.object_instance DEFAULT VALUES RETURNING id")
        object_id = cur.fetchone()[0]
        for prop, (ftype, val) in members.items():
            field_id = field_ids[prop]
            cur.execute(
                "INSERT INTO shrapnel.value (value_type_code) VALUES (%s) RETURNING id",
                (ftype,),
            )
            value_id = cur.fetchone()[0]
            if ftype == 4:
                cur.execute(
                    "INSERT INTO shrapnel.value_boolean (id, value) VALUES (%s, %s)",
                    (value_id, bool(val)),
                )
            else:
                cur.execute(
                    "INSERT INTO shrapnel.value_string (id, value) VALUES (%s, %s)",
                    (value_id, str(val)),
                )
            cur.execute(
                """
                INSERT INTO shrapnel.object_attribute_value (object_id, field_id, value_id)
                VALUES (%s, %s, %s)
                """,
                (object_id, field_id, value_id),
            )
    conn.commit()
    return "created"


def verify(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                (SELECT count(DISTINCT o.id) FROM shrapnel.object_instance o
                  JOIN shrapnel.object_attribute_value oav ON oav.object_id = o.id
                  JOIN shrapnel.field f ON f.id = oav.field_id
                  WHERE f.property_name = 'asset_id')                                   AS state_objects,
                (SELECT count(*) FROM shrapnel.object_instance)                          AS total_objects,
                (SELECT count(*) FROM shrapnel.value_boolean)                            AS bool_values,
                (SELECT count(*) FROM shrapnel.value_string)                             AS str_values,
                (SELECT count(*) FROM nebula.harvest_candidates_history h
                  WHERE h.asset_id IS NOT NULL
                    AND NOT EXISTS (
                      SELECT 1 FROM shrapnel.object_instance o
                      JOIN shrapnel.object_attribute_value oav ON oav.object_id = o.id
                      JOIN shrapnel.field f ON f.id = oav.field_id
                      JOIN shrapnel.value v ON v.id = oav.value_id
                      JOIN shrapnel.value_string vs ON vs.id = v.id
                      WHERE f.property_name = 'asset_id'
                        AND vs.value = 'asset:nexus:nebula_harvest_candidates:' || h.id::text
                    ))                                                                   AS candidates_missing_state
            """
        )
        row = cur.fetchone()
        return {
            "state_objects": row[0],
            "total_objects": row[1],
            "bool_values": row[2],
            "str_values": row[3],
            "candidates_missing_state": row[4],
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

    log.info("Ensuring shrapnel.field rows …")
    field_ids = ensure_fields(conn)
    log.info("  %d state fields ready", len(field_ids))

    candidates = fetch_candidates(conn)
    log.info("  %d candidates with assets", len(candidates))

    stats = {"created": 0, "existing": 0, "skipped": 0}
    for i, cand in enumerate(candidates):
        result = seed_candidate(conn, cand, field_ids, dry_run=args.dry_run)
        stats[result] = stats.get(result, 0) + 1
        if (i + 1) % args.batch == 0:
            log.info("  %d/%d processed (created=%d existing=%d)",
                     i + 1, len(candidates), stats["created"], stats["existing"])

    log.info("Done: %s", stats)
    if not args.dry_run:
        log.info("Verification: %s", verify(conn))
        conn.close()


if __name__ == "__main__":
    main()
