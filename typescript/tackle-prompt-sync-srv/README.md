# tackle-prompt-sync-srv — Prompt + Task Registry PG→Redis Sync

> **Port:** 3501
> **Source:** `src/index.ts`
> **Pair with:** `role-memory-srv` (port 3500, owns `mem:*` keys) and the upcoming `tackle-prompt-bridge` (reads this server's cached prompts at agent launch).

`tackle-prompt-sync-srv` reads the latest version of each prompt template per
role from `tackle.prompts` and all active rows from `tackle.tasks` in
PostgreSQL, and populates Redis with a cache that live agents can read at
launch time without hitting PG. It mirrors `role-memory-srv`'s architecture
but operates on a **disjoint key namespace** (`prompt:*`, `task:*`) so the
two sync servers can run side-by-side without colliding.

---

## Why a separate sync server?

The Role Memory Procedure Registry (`mem:*`, owned by `role-memory-srv`) and
the Prompt Registry (`prompt:*`, owned by this server) have different access
patterns:

| Registry | Access pattern | Resolved by MAX(version) | Key cache shape |
|----------|----------------|--------------------------|------------------|
| Procedures | CONSULTED on demand during turns | Not versioned — single row per slug | `mem:proc:{slug}` per card |
| Prompts | ASSEMBLED at agent launch | Yes — newest `(role, slug)` wins | `prompt:proc:{role}::{slug}` per card |

Splitting the sync keeps each server's `/health` and `/refresh` scoped to one
concern, lets them be restarted independently, and keeps the two Redis
keyspaces clean.

---

## Architecture

```
┌─────────────┐     ┌─────────────────────┐     ┌─────────────┐
│ PostgreSQL  │────▶│ tackle-prompt-sync │────▶│   Redis     │
│ tackle.     │     │ srv (:3501)         │     │ (port 6379) │
│ prompts +   │     │ PG → Redis sync    │     │             │
│ tackle.tasks│     │                     │     │ prompt:*    │
└─────────────┘     └─────────────────────┘     │ task:*      │
                                                └──────┬──────┘
                                                       │ read
                                       ┌───────────────┼───────────────┐
                                       ▼               ▼               ▼
                              tackle-prompt-      .opencode/          tackle
                              bridge (MCP)        agents/*.md         CLI
```

---

## Redis Key Schema

All keys live under the `prompt:` or `task:` prefixes (never `mem:`).

| Key Pattern | Type | Description |
|-------------|------|-------------|
| `prompt:proc:{role}::{slug}` | String (JSON) | Full `PromptCard` (latest version) for the (role, slug) pair |
| `prompt:idx:{role}` | String (JSON) | `PromptIndexEntry[]` — list of templates available for the role |
| `prompt:meta:last_updated` | String (ISO) | Global last-sync timestamp |
| `task:idx:{role}` | String (JSON) | `TaskIndexEntry[]` — active tasks for the role, with prompt slug resolved |

### `prompt:proc:{role}::{slug}` — PromptCard

```typescript
interface PromptCard {
  id: string;
  role: string;
  slug: string;
  version: number;
  title: string;
  body_md: string;
  parameter_schema: Record<string, any>;
  tags: string[];
  created_at: string;
  updated_at: string;
}
```

### `prompt:idx:{role}` — PromptIndexEntry[]

```typescript
interface PromptIndexEntry {
  slug: string;
  title: string;
  version: number;
  tags: string[];
  updated_at: string;
  // body_md omitted — index is for "which prompts exist?" lookups;
  // the body is fetched separately via prompt:proc:{role}::{slug}.
}
```

### `task:idx:{role}` — TaskIndexEntry[]

```typescript
interface TaskIndexEntry {
  task_slug: string;
  scope: string;
  acceptance_criteria: string[];
  prompt_id: string;
  prompt_slug: string;  // resolved at sync time via prompt_id → tackle.prompts.slug
  updated_at: string;
}
```

---

## REST API

### `GET /health`
Returns `{ status, lastUpdated, uptime, namespace: "prompt:" }`.

### `GET /prompts/:role`
Returns the role's `PromptIndexEntry[]` from `prompt:idx:{role}`. Empty array if no cache.

### `GET /prompt/:role/:slug`
Returns the full `PromptCard` from `prompt:proc:{role}::{slug}`. 404 if not cached.

### `GET /tasks/:role`
Returns the role's active `TaskIndexEntry[]` from `task:idx:{role}`. Empty array if no cache.

### `POST /refresh`
Triggers a full PG → Redis sync. Idempotent. Returns:
```json
{
  "prompts": 11,
  "rolePromptIndices": 10,
  "tasks": 1,
  "roleTaskIndices": 1,
  "timestamp": "2026-07-25T12:00:00.000Z"
}
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROMPT_SRV_PORT` | `3501` | HTTP server port |
| `PROMPT_REDIS_URL` | `redis://localhost:6379` (falls back to `MEMORY_REDIS_URL`) | Redis connection string |
| `PROMPT_PG_DSN` | Falls back to `TACKLE_PG_DSN` → `CONDUIT_PG_DSN` → local default | PostgreSQL DSN |

---

## Auto-heal on Redis outage

Like `role-memory-srv`, this server reconnects to Redis with always-retry
backoff and re-runs `syncAll()` on every ioredis `ready` event. A transient
Redis outage requires no manual `POST /refresh` — the cache repopulates
automatically once Redis is back. The initial boot also tolerates a down
Redis (degraded boot) so systemd's `Restart=on-failure` doesn't crash-loop
the unit during a Redis maintenance window.

---

## Source File Map

| File | Purpose |
|------|---------|
| `src/index.ts` | Express server, `/health`, `/prompts/:role`, `/prompt/:role/:slug`, `/tasks/:role`, `/refresh` |
| `src/db.ts` | PostgreSQL connection + `fetchLatestPrompts()` + `fetchActiveTasks()` |
| `src/redis.ts` | Redis connection + key helpers (`prompt:proc:`, `prompt:idx:`, `task:idx:`) |
| `src/sync.ts` | `syncAll()` — reads PG, writes all keys in one Redis pipeline |


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
