#!/usr/bin/env python3
"""Migrate all data from SQLite pipeline.db → local Postgres conduit schema.

Idempotent — safe to re-run.  Uses ON CONFLICT DO NOTHING on every INSERT.
Respects foreign-key ordering: providers/harnesses → models → role_config →
plans → circuit_breaker → cursor → sessions → tickets → receipts → work_requests.

Usage:
    CONDUIT_PG_DSN="host=localhost port=5433 user=pguser password=pgpass dbname=nexus" \
    python migrate_to_pg.py

Or set CONDUIT_PG_DSN in conduit/.env first and just run: python migrate_to_pg.py
"""

import json
import os
import sqlite3
import sys
from datetime import datetime

# ── Resolve PG DSN from env or .env file ──────────────────────
PG_DSN = os.environ.get("CONDUIT_PG_DSN", "")
if not PG_DSN:
    # Try loading from conduit/.env
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("CONDUIT_PG_DSN="):
                    PG_DSN = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break

if not PG_DSN:
    print("ERROR: CONDUIT_PG_DSN not set.  Set it or create conduit/.env.")
    sys.exit(1)

PG_SCHEMA = os.environ.get("CONDUIT_PG_SCHEMA", "conduit")
SQLITE_PATH = os.environ.get(
    "PIPELINE_DB_PATH",
    "/home/codex/dev/nexus/.conduit-data/pipeline.db",
)

print(f"Source: {SQLITE_PATH}")
print(f"Target: {PG_DSN}  (schema: {PG_SCHEMA})")
print()

# ── Connect ───────────────────────────────────────────────────
try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 not installed.  pip install psycopg2")
    sys.exit(1)

pg = psycopg2.connect(PG_DSN)
pg.autocommit = False  # we commit per batch

sq = sqlite3.connect(SQLITE_PATH)
sq.row_factory = sqlite3.Row

# ── Helpers ────────────────────────────────────────────────────


def _pg_insert(table: str, columns: list[str], rows: list[dict],
               pk_column: str = "id") -> int:
    """Insert rows into conduit.<table> with ON CONFLICT DO NOTHING."""
    if not rows:
        return 0

    placeholders = ", ".join(["%s"] * len(columns))
    col_names = ", ".join(columns)
    sql = (
        f"INSERT INTO {PG_SCHEMA}.{table} ({col_names}) "
        f"VALUES ({placeholders}) "
        f"ON CONFLICT ({pk_column}) DO NOTHING"
    )

    cur = pg.cursor()
    count = 0
    skipped = 0
    for row in rows:
        values = tuple(row.get(c) for c in columns)
        try:
            cur.execute(sql, values)
            if cur.rowcount > 0:
                count += 1
            else:
                skipped += 1
        except Exception as e:
            print(f"  WARN: {table} row {row.get(pk_column, '?')}: {e}")
            pg.rollback()
            cur = pg.cursor()
    pg.commit()
    cur.close()
    if skipped:
        print(f"  {table}: {count} inserted, {skipped} skipped (already exist)")
    else:
        print(f"  {table}: {count} rows")
    return count


def _migrate_table(
    table: str,
    columns: list[str],
    order_by: str = "id",
    where: str = "",
    pk_column: str = "id",
) -> int:
    """Read all rows from SQLite, insert into PG."""
    cols_str = ", ".join(columns)
    sql = f"SELECT {cols_str} FROM {table}"
    if where:
        sql += f" WHERE {where}"
    # Only add ORDER BY if the column exists (e.g. pipeline_cursor has PK 'role')
    if order_by:
        try:
            sq.execute(f"SELECT {order_by} FROM {table} LIMIT 1")
            sql += f" ORDER BY {order_by}"
        except sqlite3.OperationalError:
            pass  # column doesn't exist, skip ordering

    cur = sq.execute(sql)
    rows = [dict(r) for r in cur.fetchall()]
    if not rows:
        print(f"  {table}: 0 rows (empty)")
        return 0

    return _pg_insert(table, columns, rows, pk_column=pk_column)


# ── Migration order (respects FK dependencies) ────────────────

total = 0

# 1. ai_providers (no FKs)
total += _migrate_table("ai_providers", [
    "id", "name", "type", "endpoint_url", "api_key",
    "config_json", "created_at", "updated_at",
])

# 2. ai_harnesses (no FKs)
total += _migrate_table("ai_harnesses", [
    "id", "name", "invocation_semantics", "created_at", "updated_at",
])

# 3. ai_models (→ ai_harnesses, ai_providers)
total += _migrate_table("ai_models", [
    "id", "name", "harness_id", "model_identifier",
    "created_at", "updated_at", "provider_id",
])

# 4. ai_role_config (→ ai_providers, ai_harnesses, ai_models)
total += _migrate_table("ai_role_config", [
    "id", "role", "provider_id", "harness_id", "model_id",
    "extra_params", "created_at", "updated_at",
])

# 5. plans (no FKs, but referenced by most other tables)
total += _migrate_table("plans", [
    "id", "file_name", "title", "project", "goal", "content",
    "files_affected", "acceptance_criteria", "dependencies",
    "created_at", "updated_at", "prompt_ref", "deleted",
], where="deleted = 0")

# 6. circuit_breaker (single row)
total += _migrate_table("circuit_breaker", [
    "id", "tripped", "tripped_at", "retry_after", "error",
    "detail", "source", "fallback_model", "updated_at", "paused",
])

# 7. pipeline_cursor (PK is 'role', not 'id')
total += _migrate_table("pipeline_cursor", [
    "role", "last_processed_plan_id", "last_work_request_id", "updated_at",
], order_by="role", pk_column="role")

# 8. sessions (no FKs)
total += _migrate_table("sessions", [
    "id", "agent_role", "start_iso", "end_iso", "exit_code",
    "retries_used", "plans_processed", "plan_count", "pid",
    "is_running", "last_activity", "model", "fallback_used",
    "created_at", "cost_usd", "total_work_seconds",
])

# 9. tickets (self-referencing FKs: parent_ticket_id, replacement_of)
#    PG FKs are NOT DEFERRABLE by default — two-pass insert.
#    Also filters out tickets referencing non-existent plans (SQLite orphans).
print("  tickets: two-pass insert (self-referencing FKs)...")

# ── Pre-fetch valid plan IDs in PG ──
cur = pg.cursor()
cur.execute(f"SELECT id FROM {PG_SCHEMA}.plans")
valid_plan_ids = {r[0] for r in cur.fetchall()}
cur.close()

# ── Read all tickets from SQLite ──
ticket_columns = [
    "id", "plan_id", "role", "status", "session_id",
    "created_by_receipt", "created_at", "claimed_at", "closed_at",
    "token_budget", "tokens_used", "objective", "completion_criteria",
    "owner", "parent_ticket_id", "spawn_reason",
    "last_activity", "expires_at", "confidence",
    "closure_reason", "replacement_of",
]
all_ticket_rows = [
    dict(r) for r in sq.execute(
        f"SELECT {', '.join(ticket_columns)} FROM tickets ORDER BY id"
    ).fetchall()
]

# Filter out tickets with orphaned plan references
ticket_rows = []
orphaned_plan = 0
for row in all_ticket_rows:
    if row["plan_id"] in valid_plan_ids:
        ticket_rows.append(row)
    else:
        orphaned_plan += 1
if orphaned_plan:
    print(f"  tickets: {orphaned_plan} skipped (plan not in PG — likely deleted)")

# Pass 1: insert with self-ref columns set to NULL
pass1_rows = []
for row in ticket_rows:
    r = dict(row)
    r["parent_ticket_id"] = None
    r["replacement_of"] = None
    pass1_rows.append(r)
_pg_insert("tickets", ticket_columns, pass1_rows)

# ── Pre-fetch valid ticket IDs in PG (after insert) ──
cur = pg.cursor()
cur.execute(f"SELECT id FROM {PG_SCHEMA}.tickets")
valid_ticket_ids = {r[0] for r in cur.fetchall()}
cur.close()

# Pass 2: UPDATE self-references (only when target exists)
cur = pg.cursor()
updated = 0
orphaned_refs = 0
for row in ticket_rows:
    tid = row["id"]
    pid = row.get("parent_ticket_id")
    rep = row.get("replacement_of")
    sets = []
    vals = []
    if pid and pid in valid_ticket_ids:
        sets.append("parent_ticket_id = %s")
        vals.append(pid)
    elif pid:
        orphaned_refs += 1
    if rep and rep in valid_ticket_ids:
        sets.append("replacement_of = %s")
        vals.append(rep)
    elif rep:
        orphaned_refs += 1
    if sets:
        vals.append(tid)
        cur.execute(
            f"UPDATE {PG_SCHEMA}.tickets SET {', '.join(sets)} WHERE id = %s",
            vals,
        )
        updated += 1
pg.commit()
cur.close()
print(f"  tickets: {updated} self-references updated")
if orphaned_refs:
    print(f"  tickets: {orphaned_refs} self-references skipped (target not in PG)")
total += len(ticket_rows)

# 10. receipts (→ plans, tickets) — filter orphaned plan refs
print("  receipts: filtering orphaned plan references...")
rec_columns = [
    "id", "plan_id", "type", "agent_role", "session_id",
    "artifact_path", "summary", "metadata_json", "created_at",
    "ticket_id", "tokens_used",
]
all_rec_rows = [
    dict(r) for r in sq.execute(
        f"SELECT {', '.join(rec_columns)} FROM receipts ORDER BY id"
    ).fetchall()
]
rec_rows = []
rec_orphaned = 0
for row in all_rec_rows:
    if row["plan_id"] in valid_plan_ids:
        rec_rows.append(row)
    else:
        rec_orphaned += 1
if rec_orphaned:
    print(f"  receipts: {rec_orphaned} skipped (plan not in PG — likely deleted)")
total += _pg_insert("receipts", rec_columns, rec_rows)

# 11. work_requests (→ plans) — filter orphaned plan refs
print("  work_requests: filtering orphaned plan references...")
wr_columns = [
    "id", "plan_id", "status", "dco_json", "created_at", "updated_at",
]
all_wr_rows = [
    dict(r) for r in sq.execute(
        f"SELECT {', '.join(wr_columns)} FROM work_requests ORDER BY id"
    ).fetchall()
]
wr_rows = []
wr_orphaned = 0
for row in all_wr_rows:
    if row["plan_id"] in valid_plan_ids:
        wr_rows.append(row)
    else:
        wr_orphaned += 1
if wr_orphaned:
    print(f"  work_requests: {wr_orphaned} skipped (plan not in PG — likely deleted)")
total += _pg_insert("work_requests", wr_columns, wr_rows)

# ── Verify ─────────────────────────────────────────────────────
print()
print("─" * 50)
print("Verifying migration...")
cur = pg.cursor()
cur.execute(f"SELECT table_name FROM information_schema.tables WHERE table_schema = '{PG_SCHEMA}' AND table_type = 'BASE TABLE' ORDER BY table_name")
tables = [r[0] for r in cur.fetchall()]
for t in tables:
    cur.execute(f"SELECT COUNT(*) FROM {PG_SCHEMA}.{t}")
    count = cur.fetchone()[0]
    marker = "✓" if count > 0 else "○"
    print(f"  {marker} {t}: {count} rows")
cur.close()

# ── Cleanup ────────────────────────────────────────────────────
sq.close()
pg.close()

print()
print(f"Migration complete.  {total} total rows inserted.")
print("(Re-run is safe — uses ON CONFLICT DO NOTHING.)")
