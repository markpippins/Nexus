# slash-command-mcp → tools-aggregator command-router (D-2026-08-16-002)

**Date:** 2026-08-16
**Decision:** D-2026-08-16-002 (Luna sweep) — fold slash-command-mcp into
tools-aggregator as a namespaced command-router; retire `:3220`.
**Status:** Complete — `:3220` retired, unit files removed, registry cleaned.

## Why

The old architecture double-hopped: client → tools-aggregator (:3210) →
slash-command-mcp (:3220) → aggregator. The aggregator was the **only**
consumer of the 3 slash tools (`command_lookup` / `command_execute` /
`command_completions`), proxying them back to itself. Folding them in
eliminates the hop, gives the aggregator an owned read-model over
`mcp.command_registry`, and removes a redundant service from the mesh.

## What changed

### Code — tools-aggregator (`typescript/tools-aggregator/`)

New modules (aggregator-owned command-router):

| Module | Purpose |
|---|---|
| `src/command-registry.ts` | PG read-model over `mcp.command_registry` (find/resolve/search/describe). All registry PG access lives here. |
| `src/command-parser.ts` | DSL line → parsed command (ported from slash-command-mcp). |
| `src/command-coerce.ts` | Argument coercion for the 3 tools (ported from slash-command-mcp). |
| `src/command-router.ts` | Native dispatch of `command_lookup` / `command_execute` / `command_completions` (service `command-router`, protocol `local`). |

Wiring changes in `src/index.ts` + `src/discovery.ts`:

- The 3 command tools are registered natively on startup (no remote
  discovery of `:3220`; slash-command-mcp removed from `DEFAULT_SERVICES`).
- New REST namespace on the aggregator for direct clients:
  - `GET  /commands/:service/commands` — tools for a service
  - `POST /commands/execute` — execute (accepts raw DSL line **or**
    `{command, args, allowExtra}`)
  - `GET  /commands/search/:prefix` — command prefix search
  - `GET  /commands/resolve/:command` — resolve a command to its service
- `registerNativeTool()` added to `ToolDiscovery` so the aggregator can
  serve tools it owns without a remote backend.
- `mcp-types` gained a `local` protocol value for native tools.
- `pg` added to tools-aggregator deps.

### Code — slash-command-mcp (`typescript/slash-command-mcp/`)

Kept in the repo as a **pg-free adapter**: all `pg` removed from source
(`registry.ts` delegates to the aggregator `/commands/*` namespace,
`executor.ts` dispatches via `/commands/execute`, `tools.ts` no longer
imports pg), `pg` dropped from `package.json`. It typechecks/builds but is
no longer deployed or run.

### Services

- `slash-command-mcp.service` **stopped + disabled**, then the systemd unit
  files were **removed** (service + heartbeat sidecar + `.wants` symlink,
  from `~/.config/systemd/user/`).
- The repo source unit `typescript/slash-command-mcp/slash-command-mcp.service`
  was **deleted** so nothing can reinstall it.
- Removed from `bin/start-nexus-services.sh` (service list + port map).
- Port `3220` closed; nothing discovers it.

### Data

- `mcp.command_registry` re-seeded: the 3 command tools now registered under
  service `command-router`; stale `slash-command` rows removed.
- `registry.services` (service-registry :8085): row **id 62**
  `slash-command-mcp` deleted via `DELETE /api/v1/services/62` (after
  clearing its 2 `registry.service_configs` rows — `operations` +
  `lastHeartbeat`, both stale). The registry's own DELETE 500s on the
  config FK, so the config rows were removed first.
- `terrain.runnable_services` / dependency tables: no slash rows (never
  registered).

### Docs

- `docs/mcp-transport-matrix.md`: `command-router` row added, `:3220` noted
  retired.
- `python/nebula-mcp-client/nebula_mcp_client.py`: transport docstring
  updated.
- `typescript/mcp-types/src/index.ts`: consumer comment updated.
- `docs/events/*` inventories and `audit/maintenance/*` are historical
  snapshots — intentionally untouched.
- `graph/nexus-knowledge-graph.json` may still carry a slash-command-mcp
  node; it is a versioned, hand-rebuilt artifact — regenerate per its own
  rebuild workflow if a graph refresh is wanted.

## Verification

- Aggregator serves all 3 command tools natively (`command-router`,
  protocol `local`), verified live on :3210.
- End-to-end: `command_lookup`, `command_completions`, `command_execute`
  (real dispatch returns data) via aggregator `/tools/call` and the
  `/commands/*` namespace; slash adapter (pg-free) also verified on a test
  port.
- Aggregator no longer discovers `:3220`; port closed.
- `make contract-audit` still passes.

## Migration / rollback

**Migration:** nothing to run — DB rows were updated in place. On next
`start-nexus-services.sh start`, slash-command-mcp does not come back.

**Rollback:** the old code is recoverable from git (both packages, the
`start-nexus-services.sh` entry, and the unit file are in history). The
`registry.services` row and `mcp.command_registry` rows were deleted, not
just flagged — restoring them from git/seeders would be required if the
retirement were ever reversed.
