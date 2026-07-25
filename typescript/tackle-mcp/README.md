# Tackle-MCP — Role Memory Procedure Registry (Redis Client)

> **Port:** 3400  
> **Transport:** MCP JSON-RPC (HTTP `POST /`) + REST API  
> **Source:** `src/memory.ts` — Redis reader module

Tackle-mcp reads the **Role Memory Procedure Registry** from a shared Redis cache that is populated and kept warm by `role-memory-srv` (port 3500). It also manages the **AI Configuration Registry** (providers, harnesses, models, config bundles) via PostgreSQL.

This document focuses on the **Redis cache interaction** for the Role Memory Procedure Registry. For AI config management, see the REST API endpoints in `src/index.ts` or the MCP tool catalog in `src/tools.ts`.

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────────────┐
│ PostgreSQL  │────▶│ role-memory- │────▶│   Redis     │◀────│   tackle-mcp    │
│ tackle.memo-│     │ srv (:3500)  │     │ (port 6379) │     │   (:3400)       │
│ ry + tackle│     │ PG → Redis   │     │             │     │                 │
│ .role_memo-│     │ sync engine  │     │ mem:proc:*  │     │ MCP tools:      │
│ ry          │     │              │     │ mem:idx:*   │     │ memory_get_proc-│
└─────────────┘     └──────────────┘     │ mem:meta:*  │     │ edures, memory_ │
                                         └─────────────┘     │ get_procedure,  │
                                                              │ memory_refresh  │
                                                              └─────────────────┘
```

**Important:** Tackle-mcp is **read-only** with respect to Redis. It never writes to the cache. Writes originate from `role-memory-srv`'s sync engine. The only write operations tackle-mcp performs are:
- **`POST /refresh`** — proxies to `role-memory-srv` to trigger a PG → Redis sync
- **`memory_check_since`** — queries PostgreSQL directly for temporal change detection

---

## Redis Cache Interaction

### Key Patterns

All keys live under the `mem:` prefix and are shared with `role-memory-srv`. Tackle-mcp reads these keys using `ioredis` (lazy-connected, no startup failure if Redis is unavailable).

| Key Pattern | Type | Source | Description |
|-------------|------|--------|-------------|
| `mem:proc:{slug}` | String (JSON) | `src/memory.ts` — `PROC_KEY(slug)` | Full procedure card for a given slug |
| `mem:idx:{role}` | String (JSON) | `src/memory.ts` — `IDX_KEY(role)` | Procedure index (list of summaries) for a given role |
| `mem:meta:last_updated` | String (ISO timestamp) | `src/memory.ts` — `META_UPDATED_KEY` | Global timestamp of last PG → Redis sync |
| `mem:idx:{role}:updated_at` | String (ISO timestamp) | `src/memory.ts` | Last update timestamp for a role's index |

### Weak Reference Logic

When Redis cache keys are missing or stale, tackle-mcp automatically falls back to querying PostgreSQL directly. This ensures that even if the Redis cache hasn't been refreshed, agents can still retrieve procedure data. The fallback path queries `tackle.role_memory` directly and is indexed on `role, as_of_dt DESC` for performance.

The dual-path strategy works as follows:
1. Attempt to read from Redis cache first (fast path)
2. If Redis returns no data or errors, fall back to PostgreSQL (slow path)
3. Return results from whichever source had data

This pattern is implemented in `memory_get_procedures()`, `memory_get_procedure()`, and `memory_check_since()`.

### Key Helpers (from `src/memory.ts`)

```typescript
const KEY_PREFIX = "mem:";
const PROC_KEY = (slug: string) => `${KEY_PREFIX}proc:${slug}`;   // → "mem:proc:handle-review-rejection"
const IDX_KEY = (role: string) => `${KEY_PREFIX}idx:${role}`;     // → "mem:idx:engineer"
const META_UPDATED_KEY = `${KEY_PREFIX}meta:last_updated`;        // → "mem:meta:last_updated"
```

### Value Schemas

#### `mem:proc:{slug}` — ProcedureCard

```typescript
interface ProcedureCard {
  slug: string;          // e.g. "handle-review-rejection"
  title: string;         // e.g. "Handle Review Rejection"
  summary: string;       // Short description
  body_md: string;       // Full procedure body (Markdown)
  tags: string[];        // e.g. ["review", "rejection", "workflow"]
  triggers: string[];    // e.g. ["review rejected", "change flagged"]
  mcp_tools: string[];   // MCP tools referenced by this procedure
  roles: string[];       // Roles this procedure is assigned to
  updated_at: string;    // ISO 8601 timestamp
}
```

**Example value:**

```json
{
  "slug": "handle-review-rejection",
  "title": "Handle Review Rejection",
  "summary": "When a change report is rejected, the builder must create a revision.",
  "body_md": "## Procedure\n\n1. Read the rejection report...",
  "tags": ["review", "rejection"],
  "triggers": ["review rejected", "change flagged"],
  "mcp_tools": ["conduit-mcp_revise_plan"],
  "roles": ["builder", "engineer"],
  "updated_at": "2026-06-24T12:00:00Z"
}
```

#### `mem:idx:{role}` — ProcedureIndexEntry[]

```typescript
interface ProcedureIndexEntry {
  slug: string;     // e.g. "handle-review-rejection"
  summary: string;  // Short description
  tags: string[];   // e.g. ["review", "rejection"]
}
```

**Example value:**

```json
[
  { "slug": "pipeline-health-check", "summary": "Scan for blocked plans...", "tags": ["turn-protocol", "pipeline"] },
  { "slug": "handle-review-rejection", "summary": "When a change report...", "tags": ["review", "rejection"] }
]
```

---

## MCP Tools (Memory Procedure Registry)

Tackle-mcp exposes four MCP tools for memory procedure access. All tool handlers are defined in `src/tools.ts` and read from Redis via `src/memory.ts`.

### `memory_get_procedures(role)`

Reads `mem:idx:{role}` from Redis and returns the procedure index.

```json
{
  "name": "memory_get_procedures",
  "arguments": { "role": "engineer" }
}
```

**Response:**

```json
{
  "role": "engineer",
  "count": 7,
  "procedures": [
    { "slug": "pipeline-health-check", "summary": "...", "tags": [...] },
    ...
  ]
}
```

### `memory_get_procedure(slug)`

Reads `mem:proc:{slug}` from Redis and returns the full `ProcedureCard`. Returns `NOT_FOUND` error if the key is missing.

```json
{
  "name": "memory_get_procedure",
  "arguments": { "slug": "handle-review-rejection" }
}
```

### `memory_check_since(role, since)`

Queries **PostgreSQL directly** (not Redis) to check if any `tackle.role_memory` rows have been modified for a given role since the specified ISO timestamp. This is the fallback path when Redis doesn't have temporal query support.

```typescript
// SQL query from src/memory.ts
const result = await pool.query(
  `SELECT 1 FROM tackle.role_memory
   WHERE role = $1
     AND (as_of_dt > $2 OR (expiration_dt IS NOT NULL AND expiration_dt > $2))
   LIMIT 1`,
  [role, since]
);
```

### `memory_refresh()`

Proxies a `POST /refresh` call to `role-memory-srv` (port 3500), which triggers a full PG → Redis sync. Returns the number of procedures and role indices synced, plus the new timestamp.

---

## REST API Endpoints (Memory Procedure Registry)

### `GET /api/mcp/memory/role-updates`

Returns checkpoint information for all roles, showing the last known active timestamp for each role based on Redis cache state.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-07-25T10:30:00Z",
  "checkpoints": {
    "engineer": { "last_active": "2026-07-25T10:25:00Z" },
    "architect": { "last_active": "2026-07-25T10:20:00Z" }
  }
}
```

**Use case:** Agents can call this endpoint at turn start to see which roles have recent activity without polling individual indices.

---

## PG Change-Check Flow

Since Redis has no built-in temporal query capability, tackle-mcp implements a **dual-path strategy**:

```
Agent asks "has role X changed since T?"

                    ┌──────────────────┐
                    │ Has agent already │
                    │ called memory_get │  No ──→ Return "unknown, try refresh"
                    │ _procedures?      │
                    └───────┬──────────┘
                            │ Yes
                    ┌───────▼──────────┐
                    │ Query PG directly │
                    │ tackle.role_memory│
                    │ WHERE role = X   │
                    │ AND (as_of_dt >   │
                    │      T OR expira- │
                    │      tion_dt > T) │
                    └───────┬──────────┘
                            │
                    ┌───────▼──────────┐
                    │ Return true/false │
                    └──────────────────┘
```

This avoids reading stale Redis data when the cache hasn't been refreshed. The PG query is fast (indexed on `role, as_of_dt DESC`).

---

## Redis Client Configuration

From `src/memory.ts`:

```typescript
const url = process.env.MEMORY_REDIS_URL || "redis://localhost:6379";
const redis = new Redis(url, {
  connectTimeout: 10000,  // Connection timeout guard (10s)
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 5) return null;             // Give up after 5 retries
    return Math.min(times * 200, 2000);      // Exponential backoff: 200ms, 400ms, 800ms, 1600ms, 2000ms
  },
  lazyConnect: true,                          // Don't fail startup if Redis is down
  keepAlive: 30000,                           // TCP keepalive
});

// Connection event handlers for observability
redis.on("connect", () => {
  console.log("[memory-mcp] Redis connected");
});
redis.on("error", (err) => {
  console.error("[memory-mcp] Redis error:", err);
});
redis.on("reconnecting", () => {
  console.log("[memory-mcp] Redis reconnecting...");
});
```

Key properties:
- **Lazy connect** — tackle-mcp starts even if Redis is unavailable. Redis calls will fail at runtime with clear errors.
- **Connection timeout guard** — 10s timeout prevents hanging on unresponsive Redis instances.
- **Exponential backoff** — up to 2s between connection retries, max 5 attempts.
- **Keepalive** — TCP keepalive helps maintain connections through transient network issues.
- **Event logging** — All connection lifecycle events are logged for debugging.

---

## Refresh Proxy Endpoint

### `POST /refresh`

Proxies to `http://localhost:3500/refresh` (configurable via `MEMORY_SRV_URL` env var). This endpoint is **idempotent** — calling it multiple times is safe.

**Example response from role-memory-srv:**

```json
{
  "procedures": 24,
  "roleIndices": 8,
  "timestamp": "2026-06-24T14:30:00Z"
}
```

---

## Environment Variables

| Variable | Default | Used By | Description |
|----------|---------|---------|-------------|
| `PORT` | `3400` | `index.ts` | HTTP server port |
| `MEMORY_REDIS_URL` | `redis://localhost:6379` | `memory.ts` | Redis connection string |
| `MEMORY_SRV_URL` | `http://localhost:3500` | `memory.ts` | role-memory-srv URL for refresh proxy |
| `TACKLE_PG_DSN` | `postgresql://pguser:pgpass@localhost:5432/nexus` | `db.ts` | PostgreSQL DSN (falls back to `CONDUIT_PG_DSN`) |
| `CONDUIT_PG_DSN` | `postgresql://pguser:pgpass@localhost:5432/nexus` | `db.ts` | Fallback PG DSN |

---

## Source File Map

| File | Purpose |
|------|---------|
| `src/index.ts` | Express server, MCP JSON-RPC endpoint, REST routes |
| `src/memory.ts` | **Redis client** — key helpers, reader functions, PG change-check, refresh proxy, connection timeout guard |
| `src/tools.ts` | MCP tool definitions and handler registration |
| `src/db.ts` | PostgreSQL connection, schema init, AI config CRUD, session management |
| `src/types.ts` | TypeScript interfaces for AI config rows |
| `src/env.ts` | `.env` file loader |
| `src/errors.ts` | Error types and helpers |
