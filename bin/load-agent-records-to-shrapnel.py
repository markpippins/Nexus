#!/usr/bin/env python3
"""Bulk-load nebula.agent_records into the shrapnel EAV store (postgres DB).

Reads from nexus.nebula.agent_records (view), writes into shrapnel.* tables
in the `postgres` database. One object_instance per agent record, only
non-null attributes bound as EAV values.

Idempotent: guarded by a record_type_enum==-1 marker field / skips if an
object for record_id already exists (checked via a lookup by record_id value).
"""

import os, sys, json
import psycopg2
from psycopg2.extras import RealDictCursor

NEXUS_DSN = "postgresql://pguser:pgpass@localhost:5432/nexus"
SHRAPNEL_DSN = "postgresql://pguser:pgpass@localhost:5432/postgres"

# type registry: 1 Long, 2 String, 3 Double, 4 Boolean, 5 Timestamp, 6 JSONB, 7 UUID
RECORD_TYPES = ["report","engineering_log","response","architecture_note",
                "decision","analysis","assessment","prompt","inspection"]
RECORD_TYPE_ENUM = {rt: i+1 for i, rt in enumerate(RECORD_TYPES)}

def coerce(type_code, value):
    if value is None:
        return None
    if type_code == 1:  # Long
        return int(value)
    if type_code == 2:  # String
        return str(value)
    if type_code == 3:  # Double
        return float(value)
    if type_code == 4:  # Boolean
        return bool(value)
    if type_code == 5:  # Timestamp
        return value  # psycopg2 passes datetime
    if type_code == 6:  # JSONB
        return json.dumps(value) if not isinstance(value, str) else value
    if type_code == 7:  # UUID
        return str(value)
    return value

EXT = {1:"value_long",2:"value_string",3:"value_double",4:"value_boolean",
       5:"value_timestamp",6:"value_jsonb",7:"value_uuid"}

# field spec: (property_name, type_code)
FIELDS = [
    ("record_id", 7),
    ("record_type", 2),
    ("record_type_enum", 1),
    ("role", 2),
    ("title", 2),
    ("content", 2),
    ("source_path", 2),
    ("metadata", 6),
    ("tags", 6),
    ("system_id", 7),
    ("subsystem_id", 7),
    ("feature_id", 7),
    ("plan_ref", 2),
    ("candidate_id", 7),
    ("requirement_id", 7),
    ("created_at", 5),
    ("level", 1),
    ("visibility_scope", 2),
    ("model", 2),
]

def main():
    src = psycopg2.connect(NEXUS_DSN)
    dst = psycopg2.connect(SHRAPNEL_DSN)
    src.autocommit = True
    dst.autocommit = False

    # ---- ensure fields exist (upsert by property_name) ----
    with dst.cursor() as cur:
        for idx, (prop, tcode) in enumerate(FIELDS, start=1):
            cur.execute("""
                INSERT INTO shrapnel.field
                  (is_calculated, field_index, label, name, property_name, field_type_code)
                VALUES (false, %s, %s, %s, %s, %s)
                ON CONFLICT (property_name) DO UPDATE SET
                  name = EXCLUDED.name, field_type_code = EXCLUDED.field_type_code
                """, (idx, prop, prop, prop, tcode))
        dst.commit()
    print(f"fields ensured: {len(FIELDS)}")

    # ---- discover existing record_ids already loaded (dedupe) ----
    seen = set()
    with dst.cursor() as cur:
        cur.execute("""
            SELECT vu.value::text
            FROM shrapnel.object_attribute_value oav
            JOIN shrapnel.field f ON f.id = oav.field_id
            JOIN shrapnel.value v ON v.id = oav.value_id
            JOIN shrapnel.value_uuid vu ON vu.id = v.id
            WHERE f.property_name = 'record_id'
        """)
        for r in cur.fetchall():
            seen.add(r[0])

    # ---- read source rows ----
    src_cur = src.cursor(cursor_factory=RealDictCursor)
    src_cur.execute("""
        SELECT id, record_type, role, title, content, source_path, metadata,
               tags, system_id, subsystem_id, feature_id, plan_ref,
               candidate_id, requirement_id, created_at, level,
               visibility_scope, model
        FROM nebula.agent_records
        ORDER BY created_at
    """)
    rows = src_cur.fetchall()
    total = len(rows)
    print(f"source rows: {total}; already in shrapnel: {len(seen)}")

    inserted = 0
    skipped = 0
    batch = []
    for row in rows:
        rid = str(row["id"])
        if rid in seen:
            skipped += 1
            continue
        record = {}
        record["record_id"] = rid
        record["record_type"] = row["record_type"]
        record["record_type_enum"] = RECORD_TYPE_ENUM.get(row["record_type"])
        for col in ("role","title","content","source_path","metadata","tags",
                    "system_id","subsystem_id","feature_id","plan_ref",
                    "candidate_id","requirement_id","created_at","level",
                    "visibility_scope","model"):
            record[col] = row[col]
        batch.append(record)
        # commit in chunks
        if len(batch) >= 500:
            inserted += flush_batch(dst, batch)
            batch = []

    if batch:
        inserted += flush_batch(dst, batch)

    print(f"done: inserted {inserted}, skipped(dup) {skipped}")
    src.close()
    dst.close()

def flush_batch(dst, batch):
    with dst.cursor() as cur:
        n = 0
        for record in batch:
            # create object_instance
            cur.execute("INSERT INTO shrapnel.object_instance DEFAULT VALUES RETURNING id")
            oid = cur.fetchone()[0]
            # for each field, if value present, create value + ext + oav
            for prop, tcode in FIELDS:
                if prop not in record:
                    continue
                raw = record[prop]
                if raw is None:
                    continue
                # tags/[] empty array -> store as jsonb '[]'; skip empty string? keep strings
                if isinstance(raw, list) and len(raw) == 0:
                    continue
                if isinstance(raw, dict) and len(raw) == 0:
                    continue
                try:
                    val = coerce(tcode, raw)
                except Exception:
                    continue
                if val is None:
                    continue
                cur.execute("INSERT INTO shrapnel.value (value_type_code) VALUES (%s) RETURNING id", (tcode,))
                vid = cur.fetchone()[0]
                ext = EXT[tcode]
                if tcode == 6:
                    # jsonb: pass string; psycopg2 needs json via Json adapter
                    cur.execute(f"INSERT INTO shrapnel.{ext} (id, value) VALUES (%s, %s)",
                                (vid, json.dumps(val) if not isinstance(val, str) else val))
                elif tcode == 5:
                    cur.execute(f"INSERT INTO shrapnel.{ext} (id, value) VALUES (%s, %s)", (vid, val))
                else:
                    cur.execute(f"INSERT INTO shrapnel.{ext} (id, value) VALUES (%s, %s)", (vid, val))
                # field id
                cur.execute("SELECT id FROM shrapnel.field WHERE property_name=%s", (prop,))
                fid = cur.fetchone()[0]
                cur.execute("""INSERT INTO shrapnel.object_attribute_value
                               (object_id, field_id, value_id) VALUES (%s,%s,%s)""",
                            (oid, fid, vid))
            n += 1
        dst.commit()
    return n

if __name__ == "__main__":
    main()
