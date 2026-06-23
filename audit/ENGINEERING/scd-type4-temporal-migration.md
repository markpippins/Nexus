# Engineering Log: SCD Type 4 Temporal Migration

**Date:** 2026-06-21  
**Author:** Engineer  
**Status:** Executed  
**Schema:** `nebula` (13 tables migrated)

---

## Decision

Applied SCD Type 4 (system-versioned temporal) architecture to all 13 tables in the `nebula` PostgreSQL schema. The `conduit` schema (Temporal workflow engine tables) was explicitly excluded from scope — those tables are managed by the Temporal orchestrator and should not have their schema altered.

## Why SCD Type 4

| Approach | Verdict |
|---|---|
| **No versioning (status quo)** | No audit trail, no point-in-time queries, hard deletes lose data |
| **SCD Type 2 (all-in-one table)** | Simple but blows up table size for frequently updated rows; index maintenance suffers |
| **SCD Type 4 (separate history table + current view)** | Best of both: compact current-row queries through views, full history accessible, no app code changes for 90%+ of SQL patterns |
| **Postgres built-in system-versioning (TABLESAMPLE SYSTEM_TIME)** | Requires PG 13+ extension; not available on the installed version |

## Pattern: View + INSTEAD OF Triggers

Rather than changing application code (`routes.ts`, `nebula-mcp`), the migration uses PostgreSQL views with INSTEAD OF triggers:

1. **Rename** `nebula.{table}` → `nebula.{table}_history`
2. **Add** `as_of_dt` and `expiration_dt` columns
3. **Change PK** to `(original_pk, as_of_dt)`
4. **Backfill** existing rows with `as_of_dt = COALESCE(created_at, NOW())`, `expiration_dt = '9999-12-31 23:59:59+00'`
5. **Create view** `nebula.{table}` that filters `WHERE NOW() >= as_of_dt AND NOW() < expiration_dt`, hiding temporal columns
6. **INSTEAD OF triggers** intercept INSERT/UPDATE/DELETE against the view to transparently manage temporal history
7. **Partial unique indexes** enforce active-row uniqueness: `WHERE expiration_dt = '9999-12-31 23:59:59+00'`

This means all standard `SELECT`, `INSERT ... RETURNING *`, `UPDATE`, and `DELETE` patterns in the application code work unchanged.

## Known Compatibility Issues

Two SQL patterns used in `routes.ts` do not work through views with INSTEAD OF triggers:

### 1. `SELECT ... FOR UPDATE`
- **Affected endpoint:** `POST /api/requirements/:id/move` (kanban optimistic lock)
- **Fix:** Query the `_history` table directly with active-row filter:
  ```sql
  SELECT id, status FROM nebula.requirements_history
  WHERE id = $1 AND NOW() >= as_of_dt AND NOW() < expiration_dt
  FOR UPDATE
  ```

### 2. `INSERT ... ON CONFLICT`
- **Affected endpoints:** `POST /api/import`, `PUT /api/preferences/:key`, `PUT /api/systems/:id/info/:tabId`, `POST /api/audit/sync`
- **Fix:** Target the `_history` table directly and manage the upsert as an explicit expire-then-insert pattern

These fixes are documented in the COMPATIBILITY_FIXES section of the migration script.

## Execution Outcome

| Metric | Value |
|---|---|
| Tables migrated | 13 |
| History tables created | `systems_history`, `subsystems_history`, `features_history`, `requirements_history`, `system_folders_history`, `work_sessions_history`, `system_workspaces_history`, `user_preferences_history`, `audit_files_history`, `system_info_tabs_history`, `harvests_history`, `agent_records_history`, `projections_history` |
| Views created | 13 (same names as original tables) |
| Temporal engine tables | 10 in `conduit` schema — **untouched** |
| Existing data | Preserved in history tables with backfilled timestamps |
| Tables excluded (not yet created) | `nebula.cross_references` — DDL exists in schema-v2.sql but table was never run |

## Migration Script

`nexus/typescript/nebula-srv/migrations/scd-type4-temporal.sql`
