# Conduit DB config surface — one-line option-A flip

Every Conduit component (pipeline `DBAdapter`, `bridge/sync.py`,
`bridge/checkpoint.py`, API routes, executors) resolves its database
target from **two environment variables**. There are no hardcoded
DSNs in code — only in deployment files, which are passthrough-only
(see below).

## The two variables

| Variable | Meaning | Default (prod) |
|---|---|---|
| `CONDUIT_PG_DSN` | libpq connection string (host/port/user/password/dbname) | `host=localhost port=5432 user=pguser password=pgpass dbname=nexus` |
| `CONDUIT_PG_SCHEMA` | schema the pipeline tables live in (rejected: `public`; validated identifier) | `conduit` |

Resolution order for schema: explicit `DBAdapter(schema=...)` arg →
`CONDUIT_PG_SCHEMA` env → `conduit`.

## Isolation caveat (receipt-isolation option A)

Receipts are canonical in the **`vision` schema** (`vision.receipts`,
`vision.tickets`), and `_init_db` creates cross-schema fixtures in
`execution` / `nebula`. A schema-level flip therefore still shares
receipt space with prod. **Option A (dedicated test DB) means flipping
the `dbname` in `CONDUIT_PG_DSN`**, not just the schema — a test DB
gets a fully isolated `vision`.

## Where the DSN is set per deployment

| Deployment | File | Mechanism |
|---|---|---|
| Dev shell / MCP tools | `python/conduit/.env` (**local-only, gitignored** — create it in each checkout; documented defaults below) | loaded by `env_config.py` at import (never overrides real env) |
| Kernel API + bridge containers | `python/conduit/docker-compose.yml` | `${CONDUIT_PG_DSN:?}` / `${CONDUIT_PG_SCHEMA:-conduit}` passthrough from the host env |
| WRP bridge daemon (systemd) | `python/conduit/wrp-bridge-daemon.service` (+ copy in `deploy/`) | `EnvironmentFile=-/home/codex/dev/nexus/python/conduit/.env` + fallback `Environment=CONDUIT_PG_DSN=...` |

All deployment files now take their value **from the environment /
`.env`** rather than hardcoding it, so there is exactly **one place**
to flip: the `.env` (or the unit's override), then restart.

## Option-A flip drill (night shift)

1. Create the test DB (hermetic bootstrap applies the full schema
   closure):
   ```bash
   psql -h localhost -U pguser -d postgres -c "CREATE DATABASE nexus_nightshift"
   PGPASSWORD=pgpass psql -h localhost -U pguser -d nexus_nightshift \
     -f sql/ci-bootstrap/nexus-ci-bootstrap.sql
   ```
2. Flip — **one line** in `python/conduit/.env` (create the file if
   absent — it is gitignored, each checkout carries its own):
   ```
   CONDUIT_PG_DSN=host=localhost port=5432 user=pguser password=pgpass dbname=nexus_nightshift
   ```
   (or export it in the shell / systemd environment — env beats `.env`.)
3. Restart the bridge daemon: `systemctl --user restart wrp-bridge-daemon`.
4. Verify the target before running agents:
   ```bash
   psql -h localhost -U pguser -d nexus_nightshift -c "SELECT count(*) FROM vision.receipts"
   ```
   and confirm receipts created by the night-shift run land **only**
   in the test DB.

Roll-back is the same one line pointing back at `dbname=nexus`.

## CI note

The Jenkins pipeline already proves this surface end-to-end: the
hermetic CI stage sets `CONDUIT_PG_DSN` to a throwaway PG (bridge
network, `ci-conduit-pg`) and `CONDUIT_PG_SCHEMA` to a `test_conduit_*`
schema — the same variables, zero prod contact (PRs #144–#148).
