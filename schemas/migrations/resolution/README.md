# schemas/migrations/resolution — SOL resolution schema (canonical SQL home)

Canonical tracked home for the `resolution` PostgreSQL schema artifacts.

## Location / how to save

**Save resolution SQL dumps HERE** (not at `/home/codex/dev/` root):

```
nexus/schemas/migrations/resolution/
```

This is the tracked copy that gets applied to the `nexus` database's
`resolution` schema. Files kept here:

| File | What it is |
|---|---|
| `resolution_schema_consolidated.sql` | Full schema dump (pg_dump) — **current canonical schema state** |
| `resolution_data_consolidated.sql` | Full data dump (pg_dump) — **current canonical seed data** |
| `resolution_migration_v{3,4,5,6,7,11,12,13,17,18,19,20,21,22,23,23b,24b}.sql` | Incremental migrations (v3 → v24b) |
| `resolution_evaluate_proposition_v1.sql` | Proposition evaluation function (disposition fast path) |
| `resolution_comparator_v1.sql` | Cross-representation disagreement detection (`detect_disagreement`) |
| `resolution_authority_resolution_v1.sql` | Authority resolution via verified statement |
| `resolution_scheduler_v1.sql` | Reconciliation sweep (`run_reconciliation_sweep`) |
| `resolution_on_change_v2.sql` | Change-event re-evaluation hook (`on_change`) |
| `resolution_reopen_fix_v2.sql` | Relational-aware reopen of disputed propositions |
| `resolution_compiler_v{2,3,5,6,prototype}.sql` | SOL IR compiler functions (versions) |
| `resolution_peb_bridge_v{1,2}.sql` | PEB bridge schema |
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
  -f schemas/migrations/resolution/resolution_schema_consolidated.sql
psql -h localhost -U pguser -d nexus -v ON_ERROR_STOP=1 \
  -f schemas/migrations/resolution/resolution_data_consolidated.sql
```

Notes:
- Dumps are pg_dump 16.14 `--no-owner` style; `\restrict`/`\unrestrict`
  markers are no-ops on local psql 17.10 (verified).
- The `resolution` schema is a SOL sandbox — "zero blast radius to
  production" per its own comment. No external schema depends on it.
- Last applied: 2026-08-19 (v20→v24b + comparator_v1 + authority_resolution_v1 +
  scheduler_v1 + on_change_v2 + reopen_fix_v2, full swap from refreshed consolidated
  dumps; vision.work_requests seed row for `wr-mongo-wiring` applied separately).

## Related

- `schemas/migrations/tackle/` — role personas + procedure registry SQL (same convention)
- `vision` schema — separate (see `/home/codex/dev/vision.sql` upstream)
