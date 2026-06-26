---
project: conduit-mcp
dependencies: []
acceptance:
  - ls /home/codex/dev/nexus/typescript/conduit-mcp/src/db.ts
  - ls /home/codex/dev/nexus/typescript/conduit-mcp/src/watcher.ts
  - ls /home/codex/dev/nexus/.conduit-data/SESSION.md
  - cd /home/codex/dev/nexus/typescript/conduit-mcp && npx tsc --noEmit 2>&1 || true
---

# Plan 0083: Conduit Markdown Metadata → PostgreSQL Migration

**Goal:** Migrate ALL markdown-based metadata files currently stored on the
filesystem under `nexus/.conduit-data/` into the PostgreSQL `conduit` schema.
Eliminate the dual-source-of-truth problem where the watcher reads `.md` files
from disk but the DB is the actual authoritative state store. Store plan
content, prompts, change reports, inspection reports, analysis records,
requirements, work requests, and session state as database rows instead of
filesystem files.

**Status:** completed

---

## Context: The Dual-Source-of-Truth Problem

### Current Architecture

```
┌─────────────────────────────────────────────────┐
│                    Agents                        │
│  (Planner, Builder, Reviewer, Critic, Analyst)  │
└──────┬──────────────────────────────────┬───────┘
       │ write .md files                  │ query DB
       ▼                                  ▼
┌──────────────────┐            ┌──────────────────┐
│  .conduit-data/  │◀──watch───│  conduit MCP      │
│                  │──────────▶│  (PostgreSQL)     │
│  PROMPTS/*.md    │   sync    │                  │
│  IMPL_PLANS/*.md │            │  plans table     │
│  CHANGES/*.md    │            │  tickets table   │
│  INSPECTIONS/*.md│            │  receipts table  │
│  ANALYSIS/*.md   │            │  sessions table  │
│  REQUIREMENTS/*  │            │  circuit_breaker │
│  WORK_REQUESTS/* │            │  (vector schema) │
│  SESSION.md      │            │                  │
└──────────────────┘            └──────────────────┘
```

**The problem:** Plan `.md` files are the agent's write target, but the DB is
the UI's read source. The watcher syncs plan metadata (title, goal, status)
from files to DB rows. But the FULL plan content lives only in the `.md` file.
This creates:

1. **Dual authority:** Which is the source of truth — the `.md` file or the DB row?
2. **Partial sync:** Only plans are synced. Prompts, changes, inspections,
   analysis, requirements, and work requests are filesystem-only.
3. **Orphan risk:** Plan files can exist without DB rows and vice versa
   (the orphan scanner in `db.ts` detects this).
4. **No query capability:** Can't search across prompts, changes, or
   inspections without grepping files.

### Target Architecture

```
┌─────────────────────────────────────────────────┐
│                    Agents                        │
└──────────────────────┬──────────────────────────┘
                       │ write via MCP tools
                       ▼
┌─────────────────────────────────────────────────┐
│              conduit MCP (PostgreSQL)            │
│                                                  │
│  conduit.plans         conduit.prompts           │
│  conduit.plan_content  conduit.change_reports    │
│  conduit.tickets       conduit.inspections       │
│  conduit.receipts      conduit.analysis          │
│  conduit.sessions      conduit.requirements      │
│  conduit.circuit_breaker  conduit.work_requests  │
│  conduit.pipeline_state  conduit.session_state   │
│                                                  │
│  vector.providers      vector.harnesses          │
│  vector.models         vector.role_config        │
│  vector.role_models                              │
└─────────────────────────────────────────────────┘
```

All metadata lives in PostgreSQL. `.md` files become optional exports/backups.
The watcher becomes a DB-native change detector (LISTEN/NOTIFY).

---

## What's Currently On Filesystem vs In DB

### Already In PostgreSQL (`conduit` schema)

| Table | What It Tracks | How It's Populated |
|-------|---------------|-------------------|
| `plans` | Plan metadata (id, title, goal, files_affected, content, status) | Watcher syncs from .md files |
| `tickets` | Agent tickets per plan/role | MCP tools create tickets |
| `receipts` | State transition receipts per plan | MCP tools issue receipts |
| `sessions` | Agent session records | Watcher + MCP tools |
| `circuit_breaker` | Breaker state (tripped, paused) | MCP tools |
| `schema_version` | Migration tracking | Auto |

### NOT In PostgreSQL (Filesystem Only)

| Directory | Format | Count | Contents |
|-----------|--------|-------|----------|
| `PROMPTS/` | `.md` | 23 files | User prompts with YAML frontmatter, intent, decomposition, instructions, full agent response logs |
| `IMPLEMENTATION_PLANS/pending/` | `.md` | 16 files | Plan definitions with goal, files affected, acceptance criteria, implementation notes |
| `IMPLEMENTATION_PLANS/proposed/` | `.md` | 1 file | Lightweight proposal ideas |
| `IMPLEMENTATION_PLANS/planning/` | `.md` | varies | Plans in elucidation phase |
| `IMPLEMENTATION_PLANS/completed/` | `.md` | varies | Completed plans |
| `CHANGES/committed/` | `.md` | varies | Builder change reports |
| `CHANGES/flagged/` | `.md` | varies | Reviewer-flagged change reports |
| `CHANGES/reviewed/` | `.md` | varies | Reviewed change reports |
| `INSPECTIONS/reports/` | `.md` | varies | Inspector findings |
| `INSPECTIONS/errors/` | `.md` | varies | Error reports |
| `INSPECTIONS/warnings/` | `.md` | varies | Warning reports |
| `INSPECTIONS/triage/` | `.md` | varies | Triaged suggestions |
| `INSPECTIONS/resolved/` | `.md` | varies | Resolved issues |
| `INSPECTIONS/processed/` | `.md` | varies | Processed inspections |
| `INSPECTIONS/todo/` | `.md` | varies | Todo items |
| `INSPECTIONS/blocker-reports/` | `.md` | varies | Blocker reports |
| `INSPECTIONS/unresolved/` | `.md` | varies | Unresolved issues |
| `ANALYSIS/specs/` | `.md` | varies | Analysis specifications |
| `ANALYSIS/reviewed/` | `.md` | varies | Reviewed analysis |
| `REQUIREMENTS/` | `.md` | 1 file | Requirements documents |
| `WORK_REQUESTS/` | `.json` | 400+ files | Work request records |
| `SESSION.md` | `.md` | 1 file | Current pipeline session state |

### Partially In DB (Metadata Only, Not Full Content)

| DB Table | Filesystem Location | What's In DB | What's Missing From DB |
|----------|--------------------|--------------|----------------------|
| `plans` | `IMPLEMENTATION_PLANS/**/*.md` | title, goal, files_affected (JSON array), acceptance_criteria (JSON array), dependencies (JSON array), status | Full markdown body content, implementation notes, YAML frontmatter, code examples |

**Note:** The `plans` table already has a `content` column (`TEXT NOT NULL DEFAULT ''`), but the watcher only syncs metadata — it doesn't store the full markdown body. This is a partial gap.

---

## Phase 1: PostgreSQL Schema Expansion

### 1.1 New Tables

All new tables go in the `conduit` schema alongside existing tables.

#### 1.1.1 Prompts Table

```sql
CREATE TABLE conduit.prompts (
    id              TEXT PRIMARY KEY,        -- e.g. "0081"
    file_name       TEXT NOT NULL,           -- e.g. "0081-given-me-your-ideas-..."
    project         TEXT NOT NULL DEFAULT '',
    session         TEXT NOT NULL DEFAULT '',
    summary         TEXT NOT NULL DEFAULT '',
    intent_outcome  TEXT NOT NULL DEFAULT '',
    intent_priority TEXT NOT NULL DEFAULT 'medium',
    intent_abstraction TEXT NOT NULL DEFAULT 'task',
    decomposition   TEXT NOT NULL DEFAULT '',
    working_dir     TEXT NOT NULL DEFAULT '',
    instructions    TEXT NOT NULL DEFAULT '',
    response_log    TEXT NOT NULL DEFAULT '', -- full agent response (can be large)
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_prompts_project ON conduit.prompts(project);
CREATE INDEX idx_prompts_session ON conduit.prompts(session);
```

#### 1.1.2 Change Reports Table

```sql
CREATE TABLE conduit.change_reports (
    id              SERIAL PRIMARY KEY,
    session_id      TEXT NOT NULL,
    plans_processed TEXT NOT NULL DEFAULT '[]', -- JSON array of plan IDs
    file_name       TEXT NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    content         TEXT NOT NULL DEFAULT '',    -- full markdown body
    status          TEXT NOT NULL DEFAULT 'committed'
                    CHECK(status IN ('committed','flagged','reviewed')),
    reviewer_notes  TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_change_reports_session ON conduit.change_reports(session_id);
CREATE INDEX idx_change_reports_status ON conduit.change_reports(status);
```

#### 1.1.3 Inspections Table

```sql
CREATE TABLE conduit.inspections (
    id              SERIAL PRIMARY KEY,
    seq_number      TEXT,                      -- registry sequence number
    file_name       TEXT NOT NULL,
    project         TEXT NOT NULL DEFAULT '',
    category        TEXT NOT NULL DEFAULT 'report'
                    CHECK(category IN ('report','error','warning','triage',
                                       'resolved','unresolved','processed',
                                       'todo','blocker')),
    title           TEXT NOT NULL DEFAULT '',
    content         TEXT NOT NULL DEFAULT '',   -- full markdown body
    originating_prompt TEXT,
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK(status IN ('open','processed','resolved','unresolved')),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_inspections_category ON conduit.inspections(category);
CREATE INDEX idx_inspections_status ON conduit.inspections(status);
CREATE INDEX idx_inspections_project ON conduit.inspections(project);
```

#### 1.1.4 Analysis Table

```sql
CREATE TABLE conduit.analysis (
    id              SERIAL PRIMARY KEY,
    file_name       TEXT NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    content         TEXT NOT NULL DEFAULT '',   -- full markdown body
    category        TEXT NOT NULL DEFAULT 'spec'
                    CHECK(category IN ('spec','reviewed')),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
```

#### 1.1.5 Requirements Table

```sql
CREATE TABLE conduit.requirements (
    id              SERIAL PRIMARY KEY,
    file_name       TEXT NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    content         TEXT NOT NULL DEFAULT '',   -- full markdown body
    version         TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK(status IN ('draft','review','approved','rejected')),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
```

#### 1.1.6 Work Requests Table

```sql
CREATE TABLE conduit.work_requests (
    id              TEXT PRIMARY KEY,           -- wr-NNNN-TIMESTAMP
    plan_id         TEXT,                       -- optional reference to plans.id
    prompt_ref      TEXT,                       -- reference to prompts.id
    title           TEXT NOT NULL DEFAULT '',
    content         JSONB NOT NULL DEFAULT '{}',-- full work request JSON
    priority        TEXT NOT NULL DEFAULT 'medium',
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK(status IN ('open','claimed','completed','cancelled')),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_work_requests_plan ON conduit.work_requests(plan_id);
CREATE INDEX idx_work_requests_status ON conduit.work_requests(status);
```

#### 1.1.7 Session State Table

Replaces `SESSION.md`:

```sql
CREATE TABLE conduit.pipeline_state (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK(id = 1),
    active_role     TEXT NOT NULL DEFAULT '',
    active_plan     TEXT,                       -- references plans.id
    next_step       TEXT NOT NULL DEFAULT '',
    session_id      TEXT,
    lock_held_by    TEXT,                       -- builder session ID
    lock_acquired_at TEXT,
    builder_activity JSONB NOT NULL DEFAULT '[]', -- append-only activity log
    mcp_state_summary JSONB NOT NULL DEFAULT '{}',
    updated_at      TEXT NOT NULL
);

INSERT INTO conduit.pipeline_state (id, active_role, next_step, updated_at)
VALUES (1, '', '', NOW())
ON CONFLICT (id) DO NOTHING;
```

### 1.2 Enhance Existing `plans` Table

The `plans` table already has a `content` column but the watcher doesn't
store the full markdown body. Add:

```sql
-- Add full-text search capability on plan content
ALTER TABLE conduit.plans ADD COLUMN IF NOT EXISTS content_tsv tsvector;

-- Create trigger to auto-update tsvector
CREATE OR REPLACE FUNCTION conduit.plans_tsv_update() RETURNS TRIGGER AS $$
BEGIN
    NEW.content_tsv :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.goal, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_plans_tsv
    BEFORE INSERT OR UPDATE ON conduit.plans
    FOR EACH ROW EXECUTE FUNCTION conduit.plans_tsv_update();

CREATE INDEX IF NOT EXISTS idx_plans_content_tsv
    ON conduit.plans USING GIN(content_tsv);
```

---

## Phase 2: API Layer — New MCP Tools

### 2.1 Prompts CRUD Tools

**New MCP tool: `create_prompt`**

Input:
```json
{
  "project": "pipeline",
  "session": "chat-20260610-010125-71ceb1",
  "summary": "Adding slash commands to the chat UI",
  "intent": {
    "outcome": "Add slash commands to the chat UI",
    "priority": "medium",
    "abstraction": "task"
  },
  "workingDir": "/home/codex/dev",
  "instructions": "Elucidate the proposed plan...",
  "responseLog": "(full agent response)"
}
```

Output: `{ "id": "0081", "file_name": "0081-given-me-your-ideas..." }`

**New MCP tool: `get_prompt`**

Input: `{ "id": "0081" }`

Output: Full prompt record with all fields.

**New MCP tool: `query_prompts`**

Input: `{ "project": "pipeline", "session": "..." }`

Output: Array of matching prompt summaries.

### 2.2 Change Reports CRUD Tools

Already exists as `create_change_report` on the MCP server but writes to
filesystem. Modify to write to DB instead.

**Modified tool: `create_change_report`**

Input (same as current):
```json
{
  "sessionId": "builder-20260606-095",
  "plansProcessed": ["0068", "0077"],
  "title": "Slash commands implementation",
  "content": "# Builder Change Report\n..."
}
```

**New MCP tool: `get_change_reports`**

Input: `{ "sessionId": "builder-20260606-095" }`

Output: Array of change reports for that session.

### 2.3 Inspections CRUD Tools

**New MCP tool: `create_inspection`**

```json
{
  "category": "error",
  "project": "nexus-console",
  "title": "TypeScript compilation failure in planner component",
  "content": "## Error\n...",
  "originatingPrompt": "0081"
}
```

**New MCP tool: `get_inspections`**

```json
{
  "category": "error",
  "status": "open"
}
```

### 2.4 Analysis CRUD Tools

**New MCP tool: `create_analysis`**

```json
{
  "category": "spec",
  "title": "Slash Command Architecture Analysis",
  "content": "# Analysis\n..."
}
```

### 2.5 Requirements CRUD Tools

**New MCP tool: `create_requirement`**

```json
{
  "title": "v2 Builder Contract",
  "content": "# Builder Contract v2\n..."
}
```

### 2.6 Work Requests CRUD Tools

**Modified tool: `create_work_request`** (already exists but writes JSON files)

Change to write to DB instead of `WORK_REQUESTS/*.json`.

**New MCP tool: `query_work_requests`**

```json
{
  "status": "open",
  "limit": 50
}
```

### 2.7 Session State Tools

**Modified tool:** All tools that read/write `SESSION.md` instead read/write
the `conduit.pipeline_state` row.

**New MCP tool: `update_pipeline_state`**

```json
{
  "activeRole": "builder",
  "activePlan": "0077",
  "nextStep": "Execute Phase 3 of slash commands implementation"
}
```

**New MCP tool: `append_builder_activity`**

```json
{
  "entry": "Executed WorkRequest wr-0077-1781212142 (Plan 0077: Slash commands)"
}
```

This appends to the `builder_activity` JSONB array atomically.

---

## Phase 3: Watcher Overhaul

### 3.1 Current Watcher Behavior

The watcher (`src/watcher.ts` and `src/watchers/`) uses `chokidar` to watch
the filesystem for `.md` file changes. When a plan file appears/is modified,
it parses the YAML frontmatter and markdown body, extracts metadata, and
upserts into the `plans` table.

### 3.2 New Watcher Behavior

**Option A: DB-Native (Recommended)**

Replace filesystem watching with PostgreSQL `LISTEN`/`NOTIFY`:

1. Add triggers on all new tables that emit `NOTIFY` events on INSERT/UPDATE/DELETE
2. The watcher listens on a dedicated PG connection
3. On notification, it reads the DB row and emits SSE events to the UI
4. No filesystem dependency at all

```sql
-- Example trigger for plans table
CREATE OR REPLACE FUNCTION conduit.notify_plan_change() RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('plan_change', json_build_object(
        'id', COALESCE(NEW.id, OLD.id),
        'action', TG_OP,
        'derived_status', COALESCE(NEW.derived_status, OLD.derived_status)
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_plans_notify
    AFTER INSERT OR UPDATE OR DELETE ON conduit.plans
    FOR EACH ROW EXECUTE FUNCTION conduit.notify_plan_change();
```

**Option B: Hybrid (Transitional)**

During migration, keep filesystem watching but also listen to DB NOTIFY.
Agents write to DB first, then optionally write `.md` backup files. The
watcher reads from DB primarily and falls back to filesystem for agents
that haven't been updated yet.

### 3.3 Files Affected

- **MODIFY:** `nexus/typescript/conduit-mcp/src/watcher.ts`
- **MODIFY:** `nexus/typescript/conduit-mcp/src/watchers/*.ts`
- **MODIFY:** `nexus/typescript/conduit-mcp/src/db.ts` — add new table schemas, triggers, CRUD functions
- **MODIFY:** `nexus/typescript/conduit-mcp/src/tools.ts` — add new MCP tools
- **MODIFY:** `nexus/typescript/conduit-mcp/src/parser.ts` — add prompt file parser
- **MODIFY:** `nexus/typescript/conduit-mcp/src/types.ts` — add new TypeScript types

---

## Phase 4: Data Migration

### 4.1 Migration Script

Create `nexus/typescript/conduit-mcp/scripts/migrate-filesystem-to-db.ts`:

```typescript
// Pseudocode for the migration script
async function migrateAll() {
  // 1. Migrate PROMPTS/*.md → conduit.prompts
  for (const file of fs.readdirSync('nexus/.conduit-data/PROMPTS/')) {
    const content = fs.readFileSync(file, 'utf-8');
    const parsed = parsePromptMarkdown(content); // extract YAML + body
    await db.upsertPrompt(parsed);
  }

  // 2. Migrate IMPLEMENTATION_PLANS/**/*.md → conduit.plans (update content)
  for (const subdir of ['pending','proposed','planning','completed']) {
    for (const file of fs.readdirSync(`IMPLEMENTATION_PLANS/${subdir}/`)) {
      const content = fs.readFileSync(file, 'utf-8');
      const planId = extractPlanId(file); // e.g. "0077"
      await db.updatePlanContent(planId, content);
    }
  }

  // 3. Migrate CHANGES/**/*.md → conduit.change_reports
  // 4. Migrate INSPECTIONS/**/*.md → conduit.inspections
  // 5. Migrate ANALYSIS/**/*.md → conduit.analysis
  // 6. Migrate REQUIREMENTS/**/*.md → conduit.requirements
  // 7. Migrate WORK_REQUESTS/*.json → conduit.work_requests
  // 8. Migrate SESSION.md → conduit.pipeline_state
}
```

### 4.2 Migration Strategy

**Dual-write phase (1-2 weeks):**
1. All MCP tools write to both DB and filesystem
2. The watcher reads from DB primarily, filesystem as fallback
3. Run the migration script to backfill all existing data
4. Verify consistency: compare DB rows against filesystem files

**Cutover phase:**
1. Switch MCP tools to write DB-only
2. Remove filesystem watcher (or keep as read-only backup)
3. The `.conduit-data/` directory becomes an export/backup target

**Cleanup phase:**
1. Archive `.conduit-data/` to `.conduit-data/.bak/YYYY-MM-DD/`
2. Remove filesystem watcher code
3. Remove `.md` file write paths from all agent instructions

---

## Phase 5: Agent Instruction Updates

### 5.1 Builder Agent Updates

**Files affected:**
- **MODIFY:** Builder agent instructions (in MCP config or `.agent/` skills)

**Changes:**
- `Read .pipeline/SESSION.md` → `Call query_pipeline_state`
- `Write plan to IMPLEMENTATION_PLANS/pending/` → `Call create_plan` (already exists)
- `Write change report to CHANGES/committed/` → `Call create_change_report`
- `Read plan from pending/` → `Call get_plan`
- `Move plan from pending/ to active/` → `Call issue_receipt(IMPLEMENTATION)`

### 5.2 Planner Agent Updates

**Changes:**
- `Save prompt to PROMPTS/NNNN.md` → `Call create_prompt`
- `Create plan in IMPLEMENTATION_PLANS/pending/` → `Call create_plan`

### 5.3 Inspector/Analyst Agent Updates

**Changes:**
- `Write inspection to INSPECTIONS/reports/` → `Call create_inspection`
- `Write analysis to ANALYSIS/specs/` → `Call create_analysis`
- `Write error to INSPECTIONS/errors/` → `Call create_inspection(category: 'error')`

### 5.4 Reviewer Agent Updates

**Changes:**
- `Read change report from CHANGES/committed/` → `Call get_change_reports`
- `Move change report to CHANGES/flagged/` → `Call update_change_report(status: 'flagged')`

---

## Phase 6: Testing & Validation

### 6.1 Database Schema Tests

- Run `db.schema.test.ts` — verify all new tables exist
- Verify foreign key relationships
- Test full-text search on plan content
- Test NOTIFY triggers fire on INSERT/UPDATE/DELETE

### 6.2 Migration Tests

1. Create sample `.conduit-data/` files with known content
2. Run migration script
3. Verify all DB rows match file content exactly
4. Verify no data loss (row count = file count per category)

### 6.3 MCP Tool Tests

- Test `create_prompt` → `get_prompt` roundtrip
- Test `create_change_report` → `get_change_reports` roundtrip
- Test `create_inspection` with all categories
- Test `create_work_request` → `query_work_requests`
- Test `update_pipeline_state` → `query_pipeline_state` roundtrip

### 6.4 End-to-End Pipeline Test

1. Start with empty DB
2. Run seed: `POST /api/seed` creates provider/harness/model defaults
3. Create a prompt via MCP tool
4. Planner elucidates a plan via MCP tool
5. Builder implements and writes a change report via MCP tool
6. Verify all records in DB, zero filesystem dependencies

### 6.5 TypeScript Compilation

```bash
cd /home/codex/dev/nexus/typescript/conduit-mcp
npx tsc --noEmit
```

---

## Files Affected Summary

### PostgreSQL Schema (via db.ts migration)
- **NEW:** `conduit.prompts` table
- **NEW:** `conduit.change_reports` table
- **NEW:** `conduit.inspections` table
- **NEW:** `conduit.analysis` table
- **NEW:** `conduit.requirements` table
- **NEW:** `conduit.work_requests` table
- **NEW:** `conduit.pipeline_state` table
- **MODIFY:** `conduit.plans` — add `content_tsv` + full-text search trigger

### MCP Server (nexus/typescript/conduit-mcp/)
- **MODIFY:** `src/db.ts` — add new table DDL, CRUD functions, NOTIFY triggers
- **MODIFY:** `src/tools.ts` — add new MCP tool implementations
- **MODIFY:** `src/watcher.ts` — replace filesystem watching with DB NOTIFY listening
- **MODIFY:** `src/parser.ts` — add prompt markdown parser
- **MODIFY:** `src/types.ts` — add new TypeScript interfaces
- **NEW:** `scripts/migrate-filesystem-to-db.ts` — one-time migration script
- **MODIFY:** `src/db.schema.test.ts` — add tests for new tables

### Agent Instructions
- **MODIFY:** Builder agent instructions — filesystem paths → MCP tool calls
- **MODIFY:** Planner agent instructions — filesystem paths → MCP tool calls
- **MODIFY:** Reviewer agent instructions — filesystem paths → MCP tool calls
- **MODIFY:** Inspector/Analyst agent instructions — filesystem paths → MCP tool calls

### Azure Skills (nexus/.agent/skills/)
- **MODIFY:** `builder/SKILL.md` — update file paths
- **MODIFY:** `planner/SKILL.md` — update file paths
- **MODIFY:** `reviewer/SKILL.md` — update file paths

---

## What Stays Unchanged

| Component | Reason |
|-----------|--------|
| `tickets` table | Already DB-native, no filesystem dependency |
| `receipts` table | Already DB-native |
| `sessions` table | Already DB-native |
| `circuit_breaker` table | Already DB-native |
| `vector.*` tables (providers, harnesses, models, role_config, role_models) | Already DB-native |
| `plan_status` view + `plans_by_status` view | Logic stays; now fed entirely from DB |
| Angular conduit-ui | Already reads from MCP API, which reads from DB |
| SSE event emission | Kept; now driven by DB NOTIFY instead of filesystem watch |
| `orphanScan` in `/health` endpoint | Kept; adapted to scan DB-only, flag filesystem remnants |
| Pipeline manager Python code | Already uses MCP HTTP API for plan operations |

---

## What Gets Archived/Removed

| Artifact | Disposition |
|----------|-------------|
| `.conduit-data/PROMPTS/*.md` | Migrate to DB, then archive to `.bak/` |
| `.conduit-data/IMPLEMENTATION_PLANS/**/*.md` | Migrate content to DB, then archive |
| `.conduit-data/CHANGES/**/*.md` | Migrate to DB, then archive |
| `.conduit-data/INSPECTIONS/**/*.md` | Migrate to DB, then archive |
| `.conduit-data/ANALYSIS/**/*.md` | Migrate to DB, then archive |
| `.conduit-data/REQUIREMENTS/*.md` | Migrate to DB, then archive |
| `.conduit-data/WORK_REQUESTS/*.json` | Migrate to DB, then archive |
| `.conduit-data/SESSION.md` | Migrate to DB, then archive |
| Filesystem watcher (chokidar-based) | Replace with DB NOTIFY listener |
| `.watch-state.json` | Remove — no longer needed |
| `generate-registry.sh` (inspection registry) | Replace with DB query |

---

## Acceptance Criteria

1. **All metadata in PostgreSQL** — zero `.md` files in active `.conduit-data/` subdirectories (archived `.bak/` is fine)
2. **Plans table has full content** — `SELECT content FROM conduit.plans WHERE id = '0077'` returns the complete markdown body
3. **Prompts queryable** — `SELECT * FROM conduit.prompts WHERE project = 'pipeline'` returns prompts
4. **Change reports queryable by session** — `SELECT * FROM conduit.change_reports WHERE session_id = '...'` works
5. **Inspections filterable by category** — `SELECT * FROM conduit.inspections WHERE category = 'error' AND status = 'open'` works
6. **Work requests stored as structured JSONB** — `SELECT content->>'priority' FROM conduit.work_requests` works
7. **Pipeline state in DB** — `SELECT * FROM conduit.pipeline_state` returns current session state
8. **Full-text search on plans** — `SELECT title, ts_rank_cd(content_tsv, query) FROM conduit.plans, plainto_tsquery('slash commands') query WHERE content_tsv @@ query` returns results
9. **DB NOTIFY works** — inserting a plan emits a `plan_change` notification
10. **Migration script completes without errors** — all 400+ work requests, 23 prompts, 16+ plans migrated
11. **TypeScript compiles** — `npx tsc --noEmit` passes
12. **Existing tests pass** — `db.schema.test.ts` and any other existing conduit-mcp tests pass
13. **Pipeline works end-to-end** — prompt → plan → implementation → change report → review, all via DB
14. **Orphan scan clean** — `/health` reports zero orphaned files

---

## Dependencies

- **Plan 0082** (nebula localStorage → PostgreSQL) — shares the same PostgreSQL instance. Both plans modify the `conduit` database (different schemas: `nebula` vs `conduit`). No conflicts, but the DB connection pool should be sized accordingly.
- **Existing conduit-mcp** — this plan modifies the core `db.ts`, `watcher.ts`, and `tools.ts`. Any in-flight builder/planner sessions should complete before cutover.

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Data loss during migration | Dual-write phase ensures both DB and filesystem have data. Migration script is idempotent (ON CONFLICT DO NOTHING). |
| Agent instruction drift | Agent instruction files updated in lockstep with MCP tool changes |
| Watcher outage during cutover | DB NOTIFY is PG-native — no external dependency. If listener dies, UI polls `/pipeline-state` as fallback. |
| Large response logs in prompts | `prompts.response_log` is TEXT (unlimited in PG). For very large logs (>10MB), use TOAST compression automatically. |
| Concurrent builder sessions | `pipeline_state.lock_held_by` provides DB-level locking, replacing `builder.lock` file |

---

## Implementation Order

1. **Phase 1:** Run schema DDL (new tables, triggers, full-text search)
2. **Phase 2:** Implement new MCP tools (prompts, change_reports, inspections, etc.)
3. **Phase 3:** Implement DB NOTIFY watcher
4. **Phase 4:** Run migration script to backfill all existing data
5. **Phase 5:** Update agent instructions
6. **Phase 6:** Cut over — remove filesystem write paths
7. **Final:** Archive `.conduit-data/` files to `.bak/`, run test suite

---

*Plan created: 2026-06-15. Companion to Plan 0082 (browser localStorage → PostgreSQL).
References conduit-mcp `db.ts` for existing schema, `watcher.ts` for current
filesystem watch behavior, and `AGENTS.md` for the Turn-Based Planning Check.*
