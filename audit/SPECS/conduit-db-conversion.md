# Conduit DB Conversion Spec: SQLite → PostgreSQL

## Related Documents

| Document | Relationship |
|---|---|
| [`conduit-code-assessment.md`](./conduit-code-assessment.md) | Prior assessment — identified FS/DB tension as the dominant structural problem |
| [`ARCHITECTURE/conduit-hang-remediation.md`](./ARCHITECTURE/conduit-hang-remediation.md) | Hang cycle fixes — work_requests table bug identified here |
| [`PLANS/completed/0082-nebula-localstorage-to-postgres-migration.md`](./PLANS/completed/0082-nebula-localstorage-to-postgres-migration.md) | Parallel migration — nebula-ui LocalStorage → PostgreSQL |
| [`PLANS/completed/0083-conduit-markdown-metadata-to-postgres.md`](./PLANS/completed/0083-conduit-markdown-metadata-to-postgres.md) | Follow-up plan — conduit markdown metadata → PostgreSQL |

**Status:** Draft — for refinement before implementation  
**Date:** June 11, 2026  
**Context:** Kiro's [conduit-code-assessment.md](../nexus/conduit-code-assessment.md) identified the FS/DB tension as the dominant structural problem. This spec defines the conversion to PostgreSQL as the sole operational source of truth, demoting the filesystem to audit trail only.

---

## 1. Principle

> **The database is the source of truth. The filesystem is a write-only artifact sink.**

Today, Conduit has two diverging views of reality:
- **Filesystem** — `.md` plan files, `.json` DCO files, `.log` session files, `.meta.txt` metadata, `.watch-state.json` persistence
- **SQLite DB** — `plans`, `receipts`, `tickets`, `sessions`, `circuit_breaker`, `work_requests`

These diverge silently. The plan-watcher parses Markdown files and upserts into SQLite. The Python orchestrator writes DCO JSONs to `WORK_REQUESTS/` AND the `work_requests` table. Session data exists in both the `sessions` DB table and flat `.log`/`.meta.txt` files. Ten filesystem watchers parse Markdown and serve their results to the UI via `getState()` — bypassing the DB entirely for prompts, inspections, changes, and archive entries.

**What "file-juggling" means (what we're eliminating):**
- Moving `.md` files between subdirectories to represent plan state transitions (proposed → planning → pending)
- Scanning directories to determine what state plans are in
- Parsing `.md` files with regex to extract plan metadata (title, goal, files affected)
- Watchers that read filesystem events and treat them as operational state changes
- Read-then-write cycles where the filesystem IS the state

**What artifact writes continue (what we're keeping):**
- Plan `.md` files, prompt `.md` files, DCO JSONs, session log files — these are **output artifacts** consumed by other processes (AI agents, external tooling, human review). They are written once and never read back as operational state.

After conversion:
- **PostgreSQL** holds all operational state: plans (including full Markdown body), receipts, tickets, sessions, circuit breaker state, work requests, AI config
- **Filesystem** is a write-only artifact sink: plan `.md` files, prompt archives, DCO JSONs, session logs, inspection reports, change reports are **still written** for consumption by other processes. They are **never read back** to determine operational state.

---

## 2. What Changes: Filesystem Dependencies Mapped

### 2.1 Plan Files (`nexus/graph/IMPLEMENTATION_PLANS/{pending,active,completed,blocked,proposed,planning}/*.md`)

**Current behavior:**
- `plan-watcher.ts` scans directories on startup, parses `.md` files with regex, upserts into `plans` table
- `watcher.ts#createPlan()` writes a `.md` file to `pending/` as a side effect
- `watcher.ts#updatePlanMetadata()` reads the `.md` file, does regex replacements, writes it back
- `tools.ts#delete_plan` removes `.md` files from all directories
- `tools.ts#create_plan`, `revise_plan`, `promote_plan`, `unblock_plan` all move `.md` files between subdirectories (proposed → planning → pending)
- `plan-watcher.ts` watches with chokidar for add/unlink events, updates in-memory state
- `tools.ts#save_prompt` writes `.md` files to `PROMPTS/`

**After conversion:**
- Plans are created, updated, and status-transitioned entirely in PostgreSQL.
- Plan content (the Markdown body) is stored in the `plans.content` column (PostgreSQL `TEXT`).
- Status transitions are receipt-driven; subdirectory placement (`pending/`, `active/`, etc.) becomes a derived concept from `plan_status` view.
- On plan creation/update, a `.md` artifact file is **still written** to a flat `nexus/graph/IMPLEMENTATION_PLANS/` directory (no status subdirectories) — consumed by external processes (AI agents, tooling, human review). The file is regenerated from DB state each write and **never read back** as operational state.
- **File-juggling eliminated:** files are no longer moved between subdirectories to represent state transitions. Status is derived from `plan_status` view, not directory placement.
- The plan-watcher's filesystem scanning and chokidar watch are removed entirely. Plan state comes from `SELECT * FROM plan_status`.

**Affected code:**
- `nexus/typescript/conduit-mcp/src/watchers/plan-watcher.ts` — remove filesystem scanning, chokidar watch; make DB-primary only
- `nexus/typescript/conduit-mcp/src/parser.ts` — retains `parsePlanFile()` only for artifact generation (creating `.md` output, not reading for state)
- `nexus/typescript/conduit-mcp/src/watcher.ts` — `createPlan()` keeps writing `.md` artifact files to flat `nexus/graph/IMPLEMENTATION_PLANS/`; `updatePlanMetadata()` regenerates `.md` from DB state (no more regex-based in-place editing) but no longer reads files for state
- `nexus/typescript/conduit-mcp/src/tools.ts` — all file-move operations (rename between subdirectories) removed; plan file written once to a single location

### 2.2 WorkRequest DCO Files (`WORK_REQUESTS/*.json`)

**Current behavior:**
- `main.py#_dispatch_one` writes a `.json` DCO file to `WORK_REQUESTS/` **and** calls `db.add_work_request()` to write the same data to SQLite
- Neither is canonical; both accumulate indefinitely
- Work request watcher reads these files (inferred from watcher list)

**After conversion:**
- The `work_requests` PostgreSQL table is the **sole operational record**
- DCO JSONs are **still written** to `WORK_REQUESTS/` as artifact files (consumed by `cloud_executor.py` and other external processes) — but they are **never read back** as operational state
- The work-request-watcher is removed; work request status is queried from the DB

**Affected code:**
- `nexus/legacy/python/conduit/main.py` — keeps writing DCO JSON files (artifact output) but the DB write is the authoritative path
- `nexus/legacy/python/conduit/db_adapter.py` — `add_work_request()` unchanged (already DB-only)
- Work-request-watcher removed

### 2.3 Session Logs (`.conduit-data/sessions/*.log`, `.meta.txt`)

**Current behavior:**
- `main.py` writes session output to `.log` files
- The Angular UI's sessions page streams `.log` files via SSE
- `sessions` DB table holds structured metadata (start/end times, exit code, plans processed, cost)
- `.meta.txt` key=value files hold session metadata (duplicated in DB)

**After conversion:**
- Session output logs remain on disk as **audit trail only** — the raw executor stdout/stderr
- Structured session data lives exclusively in the `sessions` PostgreSQL table
- Session log streaming from the UI reads `.log` files directly (unchanged — these are audit artifacts)
- `.meta.txt` files: stop writing them; the `sessions` table is authoritative

**Affected code:**
- `nexus/legacy/python/conduit/main.py` — stop writing `.meta.txt` files
- Session watcher (SSE streaming of `.log` files) — unchanged; logs remain on disk

### 2.4 Prompt Files (`PROMPTS/*.md`)

**Current behavior:**
- `tools.ts#save_prompt` writes `.md` files to `PROMPTS/`
- `prompt-watcher.ts` watches `PROMPTS/` with chokidar, parses `.md` files, serves via `getState()`
- Prompts are not in the DB at all — purely filesystem

**After conversion:**
- Prompts are written as `.md` files to `PROMPTS/` as **audit trail only**
- On write, the prompt metadata is also upserted into a new `prompts` PostgreSQL table for queryability
- The prompt-watcher's chokidar watch is removed; prompt catalog queries read from the `prompts` table
- The `.md` files remain as human-readable archives

**New DB table:**
```sql
CREATE TABLE prompts (
    prompt_number   TEXT PRIMARY KEY,       -- e.g., "0017"
    file_name       TEXT NOT NULL,          -- e.g., "0017.md"
    project         TEXT NOT NULL DEFAULT '',
    summary         TEXT NOT NULL DEFAULT '',
    session         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Note:** `prompt_number` is a `TEXT PRIMARY KEY` (not SERIAL) to match the `plans` table convention where human-readable slugs serve as primary keys. The `save_prompt` MCP tool handler must upsert into this table (in addition to writing the `.md` audit file).

### 2.5 Inspection & Change Reports (`INSPECTIONS/`, `CHANGES/`)

**Current behavior:**
- `inspection-watcher.ts` and `changes-watcher.ts` watch their respective directories with chokidar, parse `.md` files, serve via `getState()`
- Not in the DB at all — purely filesystem

**After conversion:**
- Same pattern as prompts: `.md` files remain as **audit trail**, metadata upserted into new `inspections` and `change_reports` PostgreSQL tables
- Watchers' chokidar watches removed; UI reads from DB

**New DB tables:**
```sql
CREATE TABLE inspections (
    id              TEXT PRIMARY KEY,       -- e.g., "insp-0081-20260611"
    plan_id         TEXT REFERENCES plans(id),
    file_name       TEXT NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    finding_count   INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE change_reports (
    id              TEXT PRIMARY KEY,       -- e.g., "chg-0081-20260611"
    plan_id         TEXT REFERENCES plans(id),
    file_name       TEXT NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Note:** These tables are populated by MCP tools (e.g., `save_inspection`, `save_change_report`) that also write `.md` audit files. The `finding_count` is derived from the inspection `.md` file's parsed contents.

### 2.6 Archive Watcher (`.bak/completed-plans/`)

**Current behavior:**
- `archive-watcher.ts` watches `.bak/completed-plans/` with chokidar
- Serves archived plan entries via `getState()`

**After conversion:**
- Archive entries come from the `plans` table (filtered by status + date range) or a dedicated archive query
- The chokidar watch is removed
- `.bak/completed-plans/` files remain as historical audit artifacts; no new operational reads

### 2.7 Builder Watchdog Log (`builder-watchdog.log`)

**Current behavior:**
- `builder-watcher.ts` and `analytics-engine.ts` read `builder-watchdog.log` to detect builder activity
- Used to determine builder status (running/idle)

**After conversion:**
- Builder status is determined from the `sessions` table (`is_running`, `last_activity`, `total_work_seconds`)
- The `.log` file becomes an audit artifact; operational status reads from DB
- `builder-watcher.ts` switches to DB queries instead of log-file parsing

### 2.8 Agent Heartbeats (`agent-watcher.ts`)

**Current behavior:**
- `agent-watcher.ts` tracks agent heartbeats; mechanism inferred to be filesystem-based (part of the watcher ecosystem)
- Agent state served via `getState()#agents`

**After conversion:**
- Agent heartbeat state is derived from the `sessions` table (`is_running`, `last_activity`, `pid`)
- `agent-watcher.ts` removed; agent status computed from session queries

### 2.9 PROMTS/ Backup Directory (`PROMPTS/bak-prompts/`)

**Current behavior:**
- `prompt-watcher.ts` watches **both** `PROMPTS/*.md` and `PROMPTS/bak-prompts/*.md`
- Both directories feed into the prompt catalog

**After conversion:**
- Both directories become audit-only. Prompt catalog queries read from the `prompts` table exclusively.
- No chokidar watch for either path.

### 2.10 `index.ts` Startup Scan (nexus/graph/IMPLEMENTATION_PLANS/ upsert loop)

**Current behavior:**
- `index.ts` lines 682-727 contain a **separate** scan of `nexus/graph/IMPLEMENTATION_PLANS/` directories that upserts plan `.md` files into the DB on startup — independent of the plan-watcher
- This is a second FS→DB sync path, distinct from `plan-watcher.ts`

**After conversion:**
- Removed. Plans are created via MCP tools (DB-first). The startup scan is unnecessary.
- If needed for one-time audit ingestion, move to the future ingest process.

### 2.11 Planner Agent File Creation

**Current behavior:**
- The planner AI agent writes `.md` plan files directly to `nexus/graph/IMPLEMENTATION_PLANS/proposed/` or `planning/`
- `_sync_plan_files_to_db()` does a best-effort HTTP POST to sync these files into the DB
- The plan-watcher's chokidar watch also picks them up asynchronously

**After conversion:**
- **The planner agent must call the MCP `create_plan` tool** (which writes to PostgreSQL) as the primary path for plan creation. Writing `.md` artifact files as a side effect is fine — but the DB write must happen first.
- This is a **prerequisite** for removing the filesystem watchers — agent-created plans must be DB-first, even if `.md` artifacts are written alongside
- Existing harness instructions for the planner role need to be updated to use the `create_plan` MCP tool
- If the planner agent cannot be updated immediately, the watcher demotion (Phase C) must wait until it can

### 2.12 PID File (`mcp-server.pid`)

**Current behavior:**
- `index.ts` writes and reads a PID file for process lifecycle management
- Used to detect stale instances on restart

**After conversion:**
- Unchanged. This is a runtime process concern, not an operational data concern.
- PID management stays on the filesystem (standard Unix practice).

### 2.13 `.watch-state.json`

**Current behavior:**
- Persisted watcher in-memory state
- Read on restart to restore watcher state

**After conversion:**
- Deleted. Watcher state is derived from DB queries; no filesystem persistence needed.
- On restart, all state is rebuilt from PostgreSQL.

### 2.14 `.api-blocked` (Legacy)

**Current behavior:**
- Dead flag file; circuit breaker is in the DB

**After conversion:**
- Deleted. Already unused.

---

## 3. Schema Design: Plans Table

The current `plans` table in SQLite stores structured metadata in normalized columns but stores `content` (the Markdown body) as `TEXT`, and array fields (`files_affected`, `acceptance_criteria`, `dependencies`) as JSON strings in `TEXT` columns. This is already a reasonable hybrid design.

### 3.1 Recommendation: Keep the Hybrid, Add JSONB for Flexible Metadata

After researching PostgreSQL best practices and considering the nature of plan documents, the recommendation is:

| Column | Type | Rationale |
|--------|------|-----------|
| `id` | `TEXT PRIMARY KEY` | Plan number, e.g. `"0081"` |
| `file_name` | `TEXT NOT NULL` | Audit filename, e.g. `"add-toast-notifications-v0081.md"` |
| `title` | `TEXT NOT NULL DEFAULT ''` | Indexed for search |
| `project` | `TEXT NOT NULL DEFAULT ''` | Indexed for filtering |
| `goal` | `TEXT NOT NULL DEFAULT ''` | Short goal summary, indexed for FTS |
| `content` | `TEXT NOT NULL DEFAULT ''` | **Full Markdown body** — the complete plan document |
| `files_affected` | `JSONB NOT NULL DEFAULT '[]'` | Array of file paths |
| `acceptance_criteria` | `JSONB NOT NULL DEFAULT '[]'` | Array of criteria strings |
| `dependencies` | `JSONB NOT NULL DEFAULT '[]'` | Array of dependency strings |
| `prompt_ref` | `TEXT NOT NULL DEFAULT ''` | Prompt number reference |
| `metadata` | `JSONB NOT NULL DEFAULT '{}'` | **New** — extensible metadata bag (tags, custom fields, etc.) |
| `deleted` | `BOOLEAN NOT NULL DEFAULT FALSE` | Soft-delete flag |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | Last update timestamp |

**Indexes:**
```sql
CREATE INDEX idx_plans_status ON plans(updated_at);
CREATE INDEX idx_plans_project ON plans(project);
CREATE INDEX idx_plans_deleted ON plans(deleted) WHERE deleted = FALSE;
-- GIN indexes for JSONB containment queries
CREATE INDEX idx_plans_files ON plans USING GIN (files_affected);
CREATE INDEX idx_plans_metadata ON plans USING GIN (metadata);
-- Full-text search on title + goal + content
CREATE INDEX idx_plans_fts ON plans USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(goal, '') || ' ' || coalesce(content, ''))
);
```

### 3.2 Why Not Store the Entire Plan as a Single JSONB?

**Against:**
- PostgreSQL JSONB has a 1GB per field limit, but large text blobs in JSONB cause TOAST overhead and slower access
- Full-text search on JSONB text requires casting (`content->>'body'`), which is slower and can't use a simple GIN FTS index
- The plan body is the largest field and benefits from dedicated TEXT storage with a `tsvector` index
- Normalized columns (`title`, `project`, `goal`) are frequently queried for filtering/sorting — B-tree indexes on them outperform JSONB path queries
- The current schema already separates `content` from structured metadata; this is a good design

**For (partial JSONB):**
- `files_affected`, `acceptance_criteria`, `dependencies` are array fields — JSONB is the natural PostgreSQL type for them
- JSONB containment queries (`WHERE data @> '{"priority": "high"}'`) are useful for flexible filtering; however, `metadata` should only be added once a concrete use case exists (it is currently aspirational — see Open Questions)

**Verdict:** Use the hybrid approach. TEXT for the content body, JSONB for array fields (`files_affected`, `acceptance_criteria`, `dependencies`), normalized columns for frequently-filtered scalar fields. The `metadata` JSONB column is **aspirational** — defer adding it until a concrete consumer exists.

### 3.2.1 `content` Column Updateability

**Important:** The current `upsertPlan()` SQL `ON CONFLICT DO UPDATE SET` clause does **not** include `content`. This means plan body content is only set on INSERT; subsequent `upsertPlan` calls silently drop content changes. For the PostgreSQL migration:

- Add `content = excluded.content` to the `ON CONFLICT DO UPDATE SET` clause so that plan body revisions are persisted
- This is especially important post-conversion because the `.md` file is no longer the canonical content store — the DB `content` column is the sole authority

### 3.3 Migration from SQLite TEXT JSON to PostgreSQL JSONB

Current SQLite stores array fields as `TEXT NOT NULL DEFAULT '[]'` containing JSON strings. Migration to PostgreSQL JSONB:

```sql
-- files_affected, acceptance_criteria, dependencies are currently TEXT JSON
-- Convert to JSONB during migration
ALTER TABLE plans 
    ALTER COLUMN files_affected TYPE JSONB USING files_affected::jsonb,
    ALTER COLUMN acceptance_criteria TYPE JSONB USING acceptance_criteria::jsonb,
    ALTER COLUMN dependencies TYPE JSONB USING dependencies::jsonb;
```

The TypeScript application code already serializes these as JSON strings (`JSON.stringify(array)`). After migration, the PostgreSQL driver will handle JSONB natively — no application code changes needed at the serialization layer if using a driver that supports JSONB (e.g., `pg` with automatic JSON serialization).

**Boolean migration:** SQLite uses `INTEGER DEFAULT 0` for booleans. PostgreSQL has native `BOOLEAN`. During migration:

```sql
-- Convert 0/1 integers to FALSE/TRUE booleans
ALTER TABLE plans ALTER COLUMN deleted TYPE BOOLEAN USING deleted::int::boolean;
ALTER TABLE sessions ALTER COLUMN is_running TYPE SMALLINT;  -- 3 states, not boolean
ALTER TABLE sessions ALTER COLUMN fallback_used TYPE BOOLEAN USING fallback_used::int::boolean;
ALTER TABLE circuit_breaker ALTER COLUMN tripped TYPE BOOLEAN USING tripped::int::boolean;
ALTER TABLE circuit_breaker ALTER COLUMN paused TYPE BOOLEAN USING paused::int::boolean;
```

### 3.4 PostgreSQL ENUM Types vs CHECK Constraints

Several columns use `TEXT` with `CHECK` constraints for fixed value sets:
- `receipts.type` (14 values)
- `tickets.status` (9 values)
- `tickets.role` (planner|builder|reviewer|critic)
- `ai_providers.type` (9 values)

PostgreSQL offers native ENUM types as an alternative:

| Approach | Pros | Cons |
|----------|------|------|
| `TEXT` + `CHECK` | Easy to extend (just alter constraint); portable SQL | No ordering guarantee; typos caught only at constraint check |
| `ENUM` type | Stricter validation at type level; smaller storage (4 bytes); ordered | Harder to extend (requires `ALTER TYPE ... ADD VALUE`); less portable; enum values must be quoted differently |

**Decision: Stick with `TEXT` + `CHECK` constraints.** Rationale:
- The current schema already uses this pattern and it ports cleanly
- Receipt types and ticket statuses are still evolving (e.g., `API_LIMIT` was added recently)
- `CHECK` constraints are easier to modify in migrations
- The storage difference is negligible for these table sizes

---

## 4. The `plan_status` View

The current `plan_status` view computes `derived_status` from the receipt chain with a priority-order `CASE` statement. This ports cleanly to PostgreSQL with minor syntax adjustments:

```sql
CREATE VIEW plan_status AS
SELECT 
    p.*,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM receipts r WHERE r.plan_id = p.id AND r.type = 'REVIEW_PASS'
        ) THEN 'REVIEW_PASS'
        WHEN EXISTS (
            SELECT 1 FROM receipts r WHERE r.plan_id = p.id AND r.type = 'REVIEW_REJECT'
        ) THEN COALESCE(
            (SELECT r.type FROM receipts r 
             WHERE r.plan_id = p.id 
             AND r.type != 'BLOCK'
             ORDER BY r.created_at DESC LIMIT 1),
            'PLAN_CREATE'
        )
        ELSE COALESCE(
            (SELECT r.type FROM receipts r 
             WHERE r.plan_id = p.id 
             AND r.type NOT IN ('PROPOSED', 'PLANNING')
             ORDER BY r.created_at DESC LIMIT 1),
            (SELECT r.type FROM receipts r 
             WHERE r.plan_id = p.id 
             ORDER BY r.created_at DESC LIMIT 1),
            NULL
        )
    END AS derived_status
FROM plans p
WHERE p.deleted = FALSE;
```

**Performance note:** The correlated subqueries in `plan_status` will perform well on PostgreSQL with proper indexes on `receipts(plan_id, created_at)` and `receipts(plan_id, type)`. PostgreSQL's query planner handles these significantly better than SQLite's.

---

## 5. Full Schema: All Tables (PostgreSQL)

```sql
-- ── Plans ─────────────────────────────────────────────────────────
CREATE TABLE plans (
    id                  TEXT PRIMARY KEY,
    file_name           TEXT NOT NULL,
    title               TEXT NOT NULL DEFAULT '',
    project             TEXT NOT NULL DEFAULT '',
    goal                TEXT NOT NULL DEFAULT '',
    content             TEXT NOT NULL DEFAULT '',        -- Full Markdown body
    files_affected      JSONB NOT NULL DEFAULT '[]',
    acceptance_criteria JSONB NOT NULL DEFAULT '[]',
    dependencies        JSONB NOT NULL DEFAULT '[]',
    prompt_ref          TEXT NOT NULL DEFAULT '',
    -- metadata JSONB column DEFERRED — add only when a concrete consumer exists
    deleted             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Receipts ──────────────────────────────────────────────────────
CREATE TABLE receipts (
    id              TEXT PRIMARY KEY,
    plan_id         TEXT NOT NULL REFERENCES plans(id),
    type            TEXT NOT NULL CHECK(type IN (
                        'PLAN_CREATE','IMPLEMENTATION','REVIEW_PASS','REVIEW_REJECT','BLOCK',
                        'PROPOSED','PLANNING',
                        'REVIEW','CRITIQUE','CRITIQUE_PASS','CRITIQUE_REJECT','PLAN_BLOCK','API_LIMIT'
                    )),
    agent_role      TEXT NOT NULL,       -- planner|builder|reviewer|watchdog
    session_id      TEXT,
    ticket_id       TEXT REFERENCES tickets(id),
    artifact_path   TEXT,
    summary         TEXT NOT NULL DEFAULT '',
    metadata_json   JSONB NOT NULL DEFAULT '{}',
    tokens_used     INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(plan_id, type, session_id)
);

-- ── Sessions ──────────────────────────────────────────────────────
CREATE TABLE sessions (
    id                  TEXT PRIMARY KEY,
    agent_role          TEXT NOT NULL,
    start_iso           TIMESTAMPTZ NOT NULL,
    end_iso             TIMESTAMPTZ,
    exit_code           INTEGER,
    retries_used        INTEGER DEFAULT 0,
    plans_processed     JSONB NOT NULL DEFAULT '[]',
    plan_count          INTEGER DEFAULT 0,
    pid                 INTEGER,
    is_running          SMALLINT DEFAULT 1
                        CHECK(is_running IN (0, 1, 2)),  -- 0=ended, 1=running, 2=paused
    last_activity       TIMESTAMPTZ,
    model               TEXT,
    fallback_used       BOOLEAN DEFAULT FALSE,
    cost_usd            REAL,
    total_work_seconds  REAL NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tickets ───────────────────────────────────────────────────────
CREATE TABLE tickets (
    id                  TEXT PRIMARY KEY,
    plan_id             TEXT NOT NULL REFERENCES plans(id),
    role                TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'open'
                        CHECK(status IN (
                            'open','claimed','completed','failed',
                            'abandoned','superseded','cancelled',
                            'stale','expired'
                        )),
    session_id          TEXT,
    created_by_receipt  TEXT NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at          TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ,
    token_budget        INTEGER,
    tokens_used         INTEGER,
    objective           TEXT,
    completion_criteria TEXT,
    owner               TEXT NOT NULL DEFAULT '',
    parent_ticket_id    TEXT REFERENCES tickets(id),
    spawn_reason        TEXT,
    last_activity       TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    confidence          REAL,
    closure_reason      TEXT,
    replacement_of      TEXT REFERENCES tickets(id)
);

-- Partial unique index: one open ticket per plan+role
CREATE UNIQUE INDEX idx_tickets_open ON tickets(plan_id, role) WHERE status = 'open';

-- ── Circuit Breaker ───────────────────────────────────────────────
CREATE TABLE circuit_breaker (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK(id = 1),
    tripped         BOOLEAN DEFAULT FALSE,
    tripped_at      TIMESTAMPTZ,
    retry_after     INTEGER DEFAULT 1800,
    error           TEXT,
    detail          TEXT,
    source          TEXT,
    fallback_model  TEXT,
    paused          BOOLEAN DEFAULT FALSE,
    updated_at      TIMESTAMPTZ
);

-- ── Work Requests ─────────────────────────────────────────────────
CREATE TABLE work_requests (
    id              TEXT PRIMARY KEY,
    plan_id         TEXT REFERENCES plans(id),
    status          TEXT NOT NULL,
    dco_json        JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── AI Configuration ──────────────────────────────────────────────
CREATE TABLE ai_providers (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK(type IN (
                        'openai','anthropic','google','ollama',
                        'opencode','codex','spring_ai','lm_server','custom'
                    )),
    endpoint_url    TEXT,
    api_key         TEXT,
    config_json     JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_harnesses (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    invocation_semantics JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_models (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    harness_id       TEXT NOT NULL REFERENCES ai_harnesses(id) ON DELETE CASCADE,
    provider_id      TEXT REFERENCES ai_providers(id),
    model_identifier TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_role_config (
    id            TEXT PRIMARY KEY,
    role          TEXT NOT NULL UNIQUE CHECK(role IN ('planner','builder','reviewer','critic')),
    provider_id   TEXT NOT NULL REFERENCES ai_providers(id),
    harness_id    TEXT NOT NULL REFERENCES ai_harnesses(id),
    model_id      TEXT NOT NULL REFERENCES ai_models(id),
    extra_params  JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Pipeline Cursor ───────────────────────────────────────────────
CREATE TABLE pipeline_cursor (
    role                      TEXT PRIMARY KEY,
    last_processed_plan_id    TEXT,
    last_work_request_id      TEXT,
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── NEW: Audit Trail Tables ───────────────────────────────────────
-- prompt_number is TEXT PK (not SERIAL) to match plans table convention
CREATE TABLE prompts (
    prompt_number   TEXT PRIMARY KEY,       -- e.g., "0017"
    file_name       TEXT NOT NULL,
    project         TEXT NOT NULL DEFAULT '',
    summary         TEXT NOT NULL DEFAULT '',
    session         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inspections (
    id              TEXT PRIMARY KEY,       -- e.g., "insp-0081-20260611"
    plan_id         TEXT REFERENCES plans(id),
    file_name       TEXT NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    finding_count   INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE change_reports (
    id              TEXT PRIMARY KEY,       -- e.g., "chg-0081-20260611"
    plan_id         TEXT REFERENCES plans(id),
    file_name       TEXT NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Convenience Views ─────────────────────────────────────────────
CREATE VIEW plan_status AS
SELECT 
    p.*,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM receipts r WHERE r.plan_id = p.id AND r.type = 'REVIEW_PASS'
        ) THEN 'REVIEW_PASS'
        WHEN EXISTS (
            SELECT 1 FROM receipts r WHERE r.plan_id = p.id AND r.type = 'REVIEW_REJECT'
        ) THEN COALESCE(
            (SELECT r.type FROM receipts r 
             WHERE r.plan_id = p.id AND r.type != 'BLOCK'
             ORDER BY r.created_at DESC LIMIT 1),
            'PLAN_CREATE'
        )
        ELSE COALESCE(
            (SELECT r.type FROM receipts r 
             WHERE r.plan_id = p.id AND r.type NOT IN ('PROPOSED', 'PLANNING')
             ORDER BY r.created_at DESC LIMIT 1),
            (SELECT r.type FROM receipts r 
             WHERE r.plan_id = p.id ORDER BY r.created_at DESC LIMIT 1),
            NULL
        )
    END AS derived_status
FROM plans p
WHERE p.deleted = FALSE;

-- ── Indexes ───────────────────────────────────────────────────────
CREATE INDEX idx_receipts_plan ON receipts(plan_id, created_at);
CREATE INDEX idx_receipts_type ON receipts(type);
CREATE UNIQUE INDEX idx_receipts_unique ON receipts(plan_id, type, COALESCE(session_id, ''));
CREATE INDEX idx_sessions_running ON sessions(is_running) WHERE is_running != 0;
CREATE INDEX idx_sessions_role ON sessions(agent_role);
CREATE INDEX idx_work_requests_plan ON work_requests(plan_id);
CREATE INDEX idx_pipeline_cursor_role ON pipeline_cursor(role);
CREATE INDEX idx_plans_project ON plans(project);
CREATE INDEX idx_plans_updated ON plans(updated_at);
-- GIN for JSONB containment queries
CREATE INDEX idx_plans_files ON plans USING GIN (files_affected);
-- DEFER: CREATE INDEX idx_plans_metadata ON plans USING GIN (metadata);
-- FTS index
CREATE INDEX idx_plans_fts ON plans USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(goal, '') || ' ' || coalesce(content, ''))
);
```

---

## 6. Connection & Driver Changes

### 6.1 TypeScript (conduit-mcp)

**Current:** `better-sqlite3` — synchronous, single-connection  
**Target:** `pg` (node-postgres) — asynchronous, connection-pooled

Key changes in `db.ts`:
- `initDb()` becomes `async` — returns a `Pool` instead of a `Database`
- All query functions become `async` — `db.prepare(...).run(...)` → `await pool.query(...)`
- `db.transaction(fn)` → explicit `BEGIN/COMMIT/ROLLBACK` or `pool.query('BEGIN')` + `pool.query('COMMIT')`
- `checkpointWal()` → removed (WAL is PostgreSQL's default and automatic)
- `db.pragma(...)` → removed (SQLite-specific)
- Migration system (Phase 1 from code assessment) becomes critical — the current `createSchema()` with try/catch DDL must be replaced with a proper version-tracked migration runner BEFORE connecting to PostgreSQL.

### 6.2 Python (conduit)

**Current:** `sqlite3` — synchronous, connect-per-operation  
**Target:** `psycopg2` or `asyncpg` — connection-pooled

Key changes in `db_adapter.py`:
- `sqlite3.connect(db_path)` → `psycopg2.connect(dsn)` or `asyncpg.create_pool(dsn)`
- `conn.row_factory = sqlite3.Row` → `psycopg2.extras.RealDictCursor` or native dict returns from asyncpg
- `json.dumps(array)` for JSON columns → native `Json` adapter or automatic JSONB serialization
- `datetime.utcnow().isoformat() + 'Z'` → `NOW()` in SQL or `datetime.now(timezone.utc)`
- SQLite-style `?` placeholders → PostgreSQL `%s` (psycopg2) or `$1` (asyncpg)
- `INSERT OR IGNORE` → `INSERT ... ON CONFLICT DO NOTHING`
- `INSERT OR REPLACE` → `INSERT ... ON CONFLICT ... DO UPDATE`
- `datetime(...)` SQL functions → `NOW()`, `INTERVAL`, etc.

### 6.3 Configuration

Add to environment/config:
```bash
# PostgreSQL connection
DATABASE_URL=postgresql://user:password@localhost:5433/conduit
# Or separate components:
PGHOST=localhost
PGPORT=5433
PGDATABASE=conduit
PGUSER=conduit
PGPASSWORD=...
```

---

## 7. What Does NOT Change (Artifact Writes Continue)

These artifact writes continue — they are consumed by other processes (AI agents, `cloud_executor.py`, human review). The filesystem is write-only: artifacts are written once, never read back as operational state.

1. **Plan `.md` files** — written to `nexus/graph/IMPLEMENTATION_PLANS/` on plan create/update. Consumed by AI agents and human review. Artifact only; DB is authoritative.
2. **Session output logs** (`.conduit-data/sessions/*.log`) — raw executor stdout/stderr. Streamed via SSE to the UI. Artifact only.
3. **DCO JSON files** (`WORK_REQUESTS/*.json`) — written by the orchestrator. Consumed by `cloud_executor.py` and external tooling. Artifact only.
4. **`PROMPTS/*.md`** — human-readable prompt archives. Metadata also stored in `prompts` table for querying. Artifact only.
5. **`INSPECTIONS/` and `CHANGES/`** — human-readable audit reports. Metadata also in DB. Artifact only.
6. **PID file** — runtime process management (unchanged — operational concern, not data)
7. **Builder lock file** (`/tmp/pipeline-manager.lock`) — runtime concurrency control (unchanged — operational concern, not data)

---

## 8. What Gets Retired / Deleted (File-Juggling Only)

Only the "read-back" paths are retired. Artifact writes (Section 7) continue. What stops:

| Artifact | Disposition |
|----------|-------------|
| `.watch-state.json` | Deleted — state rebuilt from PostgreSQL on restart |
| `.api-blocked` | Deleted — already dead; circuit breaker is in DB |
| `SESSION.md` | Deleted — legacy manual notes |
| `.meta.txt` files | Stop writing; `sessions` table is authoritative |
| `pipelines.db` (committed to repo) | Removed from version control; add to `.gitignore` |
| 10 filesystem watchers (reading back) | 9 removed — all chokidar watches that scan/parse files for operational state; session-log watcher retained for SSE streaming of audit `.log` files |
| File-juggling (rename/move between dirs) | Plan `.md` files written once to a single location; no status-representing subdirectory moves |
| `_sync_plan_files_to_db()` | Removed — DB is always canonical; no FS→DB sync needed |
| `.bak/` (250+ historical session logs) | Archived; already in `sessions` table. Not read operationally. |

**What is NOT retired:**
- Writing plan `.md` files, DCO `.json` files, prompt `.md` files — these are artifact outputs for other processes (see Section 7)

---

## 9. Implementation Phases

### Phase A: Migration Framework (Prerequisite)

Before touching PostgreSQL, replace the `createSchema()` try/catch migration pattern with a proper version-tracked migration system. This is gating — you cannot run try/catch DDL against a PostgreSQL server.

**TypeScript side (conduit-mcp):**
- Add `schema_version` table with a single row (`version INTEGER`)
- Extract all current DDL to numbered migration files (`.sql` files in `migrations/`)
- Make `createSchema()` a runner that reads `schema_version`, applies pending migrations, and updates the version after each
- Migrations must be idempotent: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`

**Python side (conduit):**
- Replace column-presence checks (`PRAGMA table_info`) with `SELECT MAX(version) FROM schema_version`
- Same approach: read version, assert it meets minimum, fail fast if behind
- If staying with raw SQL (no SQLAlchemy/Alembic), use the same `schema_version` table
- If adopting SQLAlchemy, Alembic is the standard migration tool — but this adds a dependency

**Decision:** Keep it simple. Both TypeScript and Python use the same `schema_version` table with hand-rolled migration runners. This avoids adding SQLAlchemy/Alembic as a dependency for the Python side.

### Phase B: Schema Port & Dual-Write

- Create the PostgreSQL schema (all tables, indexes, views)
- Connect conduit-mcp to PostgreSQL (read/write)
- Connect Python conduit to PostgreSQL (read/write)
- Dual-write period: both SQLite and PostgreSQL updated, consistency validated
- All plan content written to the `plans.content` column on create/update

### Phase C: Watcher Demotion

**Which watchers are removed (9 of 10):**
- `plan-watcher.ts` — plan file scanning + chokidar; replaced by `plan_status` view queries
- `prompt-watcher.ts` — prompt `.md` scanning (including `bak-prompts/`); replaced by `prompts` table queries
- `inspection-watcher.ts` — inspection `.md` scanning; replaced by `inspections` table queries
- `changes-watcher.ts` — change report `.md` scanning; replaced by `change_reports` table queries
- `archive-watcher.ts` — `.bak/completed-plans/` scanning; replaced by DB archive query
- `dependency-watcher` — filesystem dependency tracking (inferred)
- `block-watcher` — filesystem block tracking (inferred)
- `work-request-watcher` — `WORK_REQUESTS/` scanning
- `breaker-watcher` (`cb-watcher.ts`) — circuit breaker filesystem polling; replaced by `circuit_breaker` table queries
- `agent-watcher.ts` — agent heartbeat tracking; replaced by `sessions` table queries

**Which watcher survives:**
- Session-log watcher — retained for SSE streaming of `.log` audit files to the Angular UI sessions page

**Watcher-side changes:**
- Remove chokidar watches from all filesystem watchers
- Switch `getState()` to DB-only queries (`plan_status` view, new `prompts`/`inspections`/`change_reports` tables)
- Plan `.md` files: regenerated from DB state on each write (no regex-based in-place editing). Session logs, prompt files, DCO JSONs: append-only (new file per event).

**SSE event changes:**
- Currently, `plan_created` / `plan_file_removed` SSE events are emitted by chokidar watchers
- After conversion, equivalent SSE events are emitted by MCP tool handlers (`issue_receipt`, `create_plan`, `promote_plan`, `unblock_plan`) via the existing `PipelineWatcher.emitToolEvent()` mechanism
- New event types: `plan_status_changed` (replaces `plan_file_added`/`plan_file_removed` for operational state), with event data derived from receipt chain
- The Angular UI's `handleSSEEvent` switch statement must be updated to handle the new event types
- The `plan_status` state heartbeat (`startStateHeartbeat()` every 10s) continues — it emits `state_full` events regardless of watcher state sourcing

### Phase D: Orchestrator Cleanup

- Remove `_sync_plan_files_to_db()` — no longer needed; DB is always canonical
- Keep writing DCO JSONs to `WORK_REQUESTS/` as **artifact output** (consumed by `cloud_executor.py`), but stop treating them as operational state
- Stop writing `.meta.txt` files; `sessions` table is authoritative
- Stop dual-write; SQLite disconnected

### Phase E: File Cleanup & Hardening

- Delete `.watch-state.json`, `.api-blocked`, `SESSION.md`
- Archive `WORK_REQUESTS/`, `.bak/` to `.archive/`
- Add `pipeline.db` and `pipelines.db` to `.gitignore`
- Remove committed `pipelines.db` from version control

---

## 10. Existing Data: Preservation Strategy

**Do not import existing plans, receipts, tickets, or sessions into PostgreSQL.** The user's instruction is clear: what matters is leaving existing state in place to be consumed later by an ingest process.

**What stays in SQLite:**
- All existing plans (including soft-deleted)
- All existing receipts, tickets, sessions
- Circuit breaker state
- Work request history
- AI configuration

**What the ingest process will handle later:**
- A one-time migration script reads all rows from the SQLite `pipeline.db` and inserts them into PostgreSQL
- This is explicitly out of scope for the conversion spec

**What happens at cutover:**
- The existing `pipeline.db` SQLite file is left in place, untouched
- The PostgreSQL database starts fresh — new plans, receipts, tickets, sessions are created in PostgreSQL
- The Angular UI reads from the new DB; historical data remains in SQLite until the ingest process runs
- **The kanban board will appear empty** after cutover. This is expected — only newly created plans (post-cutover) will be visible. Historical plans will reappear only after the future ingest process migrates them.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Migration-in-init pattern breaks against PostgreSQL | Phase A (migration framework) must complete first |
| SQLite-specific SQL (dynamic typing, `INSERT OR IGNORE`, `datetime()`) silently behaves differently | Audit all queries during Phase B; use PostgreSQL-native equivalents |
| Connection pooling complexity (better-sqlite3 was synchronous single-connection) | Use `pg.Pool` with reasonable defaults (min 2, max 10); audit for connection leaks |
| WAL checkpointing becomes unnecessary but connection management becomes critical | Remove all `checkpointWal()` calls; ensure connections are released back to pool |
| `plan_status` view performance with correlated subqueries | PostgreSQL handles these well with proper indexes; benchmark with production data volume |
| Dual-write complexity during transition | Keep the transition window short (hours, not days); validate with automated consistency checks |
| `content` column (full Markdown) grows large over time | `TEXT` in PostgreSQL can handle up to 1GB; typical plans are <50KB; TOAST handles large values automatically |
| Python `sqlite3` → `psycopg2` breaking changes | Write adapter layer tests; run the Python test suite against PostgreSQL |
| No `INSERT OR IGNORE` in PostgreSQL | Use `INSERT ... ON CONFLICT DO NOTHING` (cleaner and standard SQL) |

---

## 12. Open Questions for Refinement

1. **PostgreSQL hosting:** Local instance on the dev machine? Docker container? Cloud (RDS, Supabase, etc.)? This affects connection string configuration and migration tooling choices.

2. **Connection pooling in Python:** `psycopg2` with its own pool? Or `asyncpg` (async-native, higher performance)? The current Python code is synchronous; `psycopg2` is the simpler path.

3. **Migration tooling:** Node.js side — continue with hand-rolled migration runner? Or adopt a tool like `node-pg-migrate`? Python side — Alembic + SQLAlchemy? Or keep the simple adapter pattern?

4. **FTS language:** The `to_tsvector('english', ...)` assumes English plan content. Should this be configurable?

5. **Audit file retention:** How long should audit `.md` files be kept on disk? Indefinitely? Rotation policy?

6. **`content` column population:** When a plan is created via `create_plan` MCP tool, does the agent also submit the full Markdown body? The current `createSchema` has `content TEXT NOT NULL DEFAULT ''` — plans can exist without content. Should content be required at creation time?
