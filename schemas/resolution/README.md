# schemas/resolution — SOL resolution schema (canonical SQL home)

Canonical tracked home for the `resolution` PostgreSQL schema artifacts.

## Location / how to save

**Save resolution SQL dumps HERE** (not at `/home/codex/dev/` root):

```
nexus/schemas/resolution/
```

This is the tracked copy that gets applied to the `nexus` database's
`resolution` schema. Files kept here:

| File | What it is |
|---|---|
| `resolution_schema_consolidated.sql` | Full schema dump (pg_dump) — **current canonical schema state** |
| `resolution_data_consolidated.sql` | Full data dump (pg_dump) — **current canonical seed data** |
| `resolution_migration_v{3..12}.sql` | Incremental migrations (v3 → v12) |
| `resolution_compiler_v{2,3,5,6,prototype}.sql` | SOL IR compiler functions (versions) |
| `resolution_peb_bridge_v1.sql` | PEB bridge schema |
| `resolution_oq_seed.sql`, `resolution_rollup_seed.sql` | Seed data sets |
| `resolution_schema_v2.sql`, `resolution.sql` | Earlier full-schema states |

## Apply procedure (refreshed consolidated files)

When the **consolidated** files are refreshed, apply them to the live DB:

```bash
export PGPASSWORD=pgpass
# 1. backup current (empty/old) schema
pg_dump -h localhost -U pguser -d nexus --schema=resolution --schema-only \
  -f /tmp/opencode/resolution_backup_$(date +%F).sql
# 2. full swap (only when no external deps — pre-check with pg_depend)
psql -h localhost -U pguser -d nexus -c "DROP SCHEMA resolution CASCADE;"
psql -h localhost -U pguser -d nexus -v ON_ERROR_STOP=1 \
  -f schemas/resolution/resolution_schema_consolidated.sql
psql -h localhost -U pguser -d nexus -v ON_ERROR_STOP=1 \
  -f schemas/resolution/resolution_data_consolidated.sql
```

Notes:
- Dumps are pg_dump 16.14 `--no-owner` style; `\restrict`/`\unrestrict`
  markers are no-ops on local psql 17.10 (verified).
- The `resolution` schema is a SOL sandbox — "zero blast radius to
  production" per its own comment. No external schema depends on it.
- Last applied: 2026-08-16 (record `d2bbb8c3`).

## Related

- `schemas/tackle/` — role personas + procedure registry SQL (same convention)
- `vision` schema — separate (see `/home/codex/dev/vision.sql` upstream)
