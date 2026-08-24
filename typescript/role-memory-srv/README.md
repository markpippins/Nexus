# role-memory-srv

**PG-to-Redis sync server** for the Role Memory Procedure Registry.

Reads procedure definitions from `tackle.memory` and `tackle.role_memory` in PostgreSQL and populates a Redis cache that tackle-mcp and MCP tool aggregators query at runtime.

## Architecture

```
                   ┌───────────────────────┐
                   │  PostgreSQL :5432      │
                   │  tackle.memory         │
                   │  tackle.role_memory    │
                   └──────────┬────────────┘
                              │ SELECT * FROM tackle.memory
                              │ JOIN tackle.role_memory
                              ▼
              ┌──────────────────────────────┐
              │  role-memory-srv :3500        │
              │  syncAll() — reads PG,       │
              │  writes Redis pipeline        │
              └──────────────┬───────────────┘
                             │ SET mem:proc:{slug}
                             │ SET mem:idx:{role}
                             │ SET mem:meta:last_updated
                             ▼
                   ┌───────────────────────┐
                   │  Redis :6379           │
                   │  mem:proc:*            │
                   │  mem:idx:*             │
                   │  mem:meta:last_updated │
                   └───────────────────────┘
                             │ GET
                             ▼
                   ┌───────────────────────┐
                   │  tackle-mcp (:3400)    │
                   │  tools-aggregator      │
                   │  (:3200)               │
                   └───────────────────────┘
```

## Redis Keyspace Reference

The service manages three key patterns under the `mem:` namespace. All keys are **strings** containing serialized JSON — no TTL is set because the cache is fully invalidated on the next `POST /refresh`.

### 1. `mem:proc:{slug}` — Procedure Body Cache

Stores the full procedure definition for a single procedure slug.

**Key pattern:** `mem:proc:{slug}` where `{slug}` is the `tackle.memory.slug` value (e.g., `rover-harvest-notification`, `planning-elucidation`).

**Value schema** (serialized JSON):
```typescript
interface ProcedureCard {
  slug: string;        // Unique procedure identifier
  title: string;       // Human-readable title
  summary: string;     // One-line summary
  body_md: string;     // Full procedure markdown body
  tags: string[];      // Categorization tags
  triggers: string[];  // Keywords that trigger this procedure
  mcp_tools: string[]; // MCP tools needed to execute
  roles: string[];     // Roles this procedure is assigned to
  updated_at: string;  // ISO 8601 timestamp
}
```

**Example:**
```
Key:   mem:proc:planning-elucidation
Value: {"slug":"planning-elucidation","title":"Planning Elucidation Workflow",...}
```

**Set by:** `syncAll()` — one `SET` per procedure in a Redis pipeline.  
**Read by:** `GET /procedure/:slug` endpoint, tackle-mcp MCP tools.

### 2. `mem:idx:{role}` — Procedure Index per Role

Stores a lightweight index of procedure slugs and summaries for a given role. Used for fast "what procedures does this role have?" queries without fetching full bodies.

**Key pattern:** `mem:idx:{role}` where `{role}` is a role name (e.g., `engineer`, `planner`, `architect`, `builder`, `reviewer`, `inspector`).

**Value schema** (serialized JSON array):
```typescript
interface ProcedureIndexEntry {
  slug: string;    // Procedure identifier
  summary: string; // One-line summary
  tags: string[];  // Categorization tags
}

type ProcedureIndex = ProcedureIndexEntry[];
```

**Example:**
```
Key:   mem:idx:engineer
Value: [{"slug":"rover-harvest-notification","summary":"After harvests...","tags":["harvest","post-processing"]}, ...]
```

**Set by:** `syncAll()` — one `SET` per distinct role found in active role_memory assignments.  
**Read by:** `GET /procedures/:role` endpoint, tackle-mcp MCP tools, tools-aggregator.

### 3. `mem:meta:last_updated` — Cache Invalidation Timestamp

Stores the ISO 8601 timestamp of the most recent cache sync. Agents check this to detect stale indexes and trigger a re-sync if needed.

**Key pattern:** `mem:meta:last_updated` (fixed, no variable component).

**Value:** ISO 8601 timestamp string.  
**Example:** `2026-06-28T12:34:56.789Z`

**Set by:** `syncAll()` — always written last in the Redis pipeline so it represents completion.  
**Read by:** `GET /health` endpoint (returns as `lastUpdated`), tackle-mcp `memory_check_since` tool.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check — returns `{status, lastUpdated, uptime}` |
| `GET` | `/procedures/:role` | Return procedure index for a role (`mem:idx:{role}`) |
| `GET` | `/procedure/:slug` | Return full procedure card (`mem:proc:{slug}`) |
| `POST` | `/refresh` | Trigger full re-sync from PostgreSQL → Redis |

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MEMORY_SRV_PORT` | `3500` | HTTP server port |
| `MEMORY_REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `MEMORY_PG_DSN` | (falls back to `CONDUIT_PG_DSN`) | PostgreSQL DSN for `tackle` schema |
| `CONDUIT_PG_DSN` | `postgresql://pguser:pgpass@localhost:5432/nexus` | Fallback PostgreSQL DSN |

## Startup Sequence

1. Connect to PostgreSQL (reads `tackle.memory` + `tackle.role_memory`)
2. Connect to Redis
3. Run `syncAll()` — fetches all active procedures+roles, writes Redis pipeline atomically
4. Listen on `:3500`

## Sync Lifecycle

- **Startup sync:** Automatic — `syncAll()` runs on boot before accepting requests.
- **Manual refresh:** `POST /refresh` — triggers a full re-sync. Used by tackle-mcp's `memory_refresh` tool or by external scripts when procedure definitions change.
- **Incremental check:** tackle-mcp's `memory_check_since` tool calls `hasChangesSince()` in `db.ts` to avoid unnecessary full syncs.
- **Idempotent:** Re-running syncAll() overwrites all keys. No TTL is needed since the cache is fully invalidated on the next refresh.

## Dependencies

- `express` — HTTP server
- `ioredis` — Redis client
- `pg` — PostgreSQL client

## Source Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Express server, route handlers, startup orchestration |
| `src/db.ts` | PostgreSQL queries — `fetchAllActiveMemory()`, `hasChangesSince()` |
| `src/sync.ts` | `syncAll()` — reads PG, builds cache, writes Redis pipeline |
| `src/redis.ts` | Redis client init, key helpers (`PROC_KEY`, `IDX_KEY`, `META_UPDATED_KEY`) |

## Related

- [`nexus/schemas/migrations/tackle/memory_procedure_registry.sql`](../../schemas/migrations/tackle/memory_procedure_registry.sql) — PostgreSQL DDL for the `tackle.memory` and `tackle.role_memory` tables
- `nexus/typescript/tackle-mcp/` — MCP server that reads from the Redis cache (via HTTP to role-memory-srv or directly via tools-aggregator)
- `nexus/typescript/tools-aggregator/` — Aggregates all MCP tools including procedure registry queries


---

## REST API & OpenAPI

- Endpoint inventory: [`API.md`](./API.md) (generated from source route registrations)
- OpenAPI 3.0 spec: [`openapi.yaml`](./openapi.yaml) (generated from source route registrations)

Regenerate after route changes:

```bash
cd nexus
python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json
```
