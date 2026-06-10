# Conduit — Architecture

> **Conduit vs Nexus Work Request Pipeline**
> Conduit is the active, operational orchestrator for the pipeline.
> The Nexus Work Request Pipeline architecture under `.agent/` is an
> aspirational target — Conduit implements the production path.

The WorkRequest type and the WorkRequestFactory are shared concepts.

This document is the single reference for the Conduit system spanning
three projects (`nexus/python/conduit/`, `nexus/typescript/conduit-mcp/`, `nexus/angular/conduit-ui/`) and a
shared SQLite database. An agent (or developer) arriving fresh should find
everything needed here to understand how work flows from cron →
discovery → DCO → executor → audit trail.

---

## 0. Receipt-First Authority

**Receipts are the sole authority for plan state.** The filesystem is a mirror,
not a source of truth.

A plan's position in the pipeline is derived exclusively from its receipt
chain via the `plan_status` SQL view. Writing a `.md` file directly to
`IMPLEMENTATION_PLANS/pending/` **will NOT make the plan appear in the
pipeline.** Without a receipt, the plan has no `derived_status` and is
invisible to all roles.

### How to create a plan (the right way)

| Method | Tool | Directory | Receipt Issued |
|--------|------|-----------|---------------|
| Capture an idea | `create_proposed_plan` | `proposed/` | `PROPOSED` |
| Create directly into implementation | `create_plan` | `pending/` | `PLAN_CREATE` |
| Via the UI | Planner → + New or 💡 New | `proposed/` or `pending/` | `PROPOSED` or `PLAN_CREATE` |

**Do NOT write `.md` files directly to `IMPLEMENTATION_PLANS/`.** Always use
an MCP tool or the conduit-ui Angular dashboard so a receipt is issued. The plan-watcher
will upsert the file into the DB, but without a receipt the plan sits in
limbo (NULL `derived_status`, invisible to all roles).

### How external processes must adapt

If you have a script or agent that writes plan files:

1. **Stop writing to `IMPLEMENTATION_PLANS/pending/` directly.**
2. **Call `create_proposed_plan` or `create_plan` via the MCP HTTP API**
   (`POST /tools/call`). These tools handle file creation AND receipt issuance.
3. **Or, if you must write the file yourself**, follow it immediately with
   an `issue_receipt` call to create the corresponding receipt.

Example: creating a plan via curl
```bash
curl -s -X POST http://localhost:3100/tools/call \
  -H 'Content-Type: application/json' \
  -d '{"name":"create_proposed_plan","arguments":{"title":"My feature","project":"my-project","goal":"What to build"}}'
```

---

## 1. Two Contracts

These are the non-negotiable design constraints. Every change must respect both.

### 1.1 State Machine (S0–S9)

The pipeline follows a deterministic state machine with exactly one LLM step
(S6). Every other step is pure SQL or in-process logic.

| Stage | Name            | LLM? | Description                                                                 |
|-------|-----------------|------|-----------------------------------------------------------------------------|
| S0    | Cron trigger    | No   | `*/3 * * * * pipeline-manager --all` fires `main.py`                        |
| S1    | Lock            | No   | `fcntl.flock` on `/tmp/pipeline-manager.lock` — only one instance at a time |
| S2    | Discover        | No   | SQL query on `plan_status.derived_status` for each role's eligibility       |
| S3    | Normalize       | No   | `WorkRequestFactory.create_from_plan()` — plan metadata → DCO (JSON)        |
| S4    | Dispatch loop   | No   | Iterate over eligible plans, call `_dispatch_one()` for each                 |
| S5    | Resolve         | No   | `resolve_executor(registry, harness)` — look up executor from registry.json |
| S6    | Execute         | YES  | `subprocess` → `executor_cloud.py` → opencode (the **only** LLM call)       |
| S7    | Commit          | No   | Write receipt + WorkResultEvent, update `work_requests` status               |
| S8    | Cursor advance  | No   | `db.advance_cursor(role, plan_id, wr_id)` — monotonic, never rewinds        |
| S9    | Exit            | No   | Release lock, exit 0 (idle) or propagate failure                            |

### 1.2 Idle Guarantee

A cron cycle with **zero eligible plans** produces **zero inference activity**.

- S2 discovery is a single SQL query — no LLM calls, no network.
- If `eligible_plans` is empty, S3–S8 are skipped entirely.
- The entire idle path is O(1) deterministic: lock → query → exit(0).

Token bleed for an idle cycle = **0 tokens**.

---

## 2. Data Flow Diagram

```
crontab (every 3 min)
    │
    ▼
main.py --all
    │
    ├─ S1: acquire_lock() ─── fcntl on /tmp/pipeline-manager.lock
    │
    ├─ for role in [builder, reviewer, planner, critic]:
    │     │
    │     ├─ S1b: check stale sessions (watchdog, 30 min timeout)
    │     │
    │     ├─ S2: db.get_eligible_plans(role)
    │     │       SELECT * FROM plan_status WHERE derived_status IN (...)
    │     │       → no eligible? print, return
    │     │
    │     ├─ S2b: (planner only) db.get_blocked_plans() — advisory
    │     │
    │     ├─ for each eligible plan:
    │     │     │
    │     │     ├─ S3: WorkRequestFactory.create_from_plan() → DCO (JSON)
    │     │     ├─ S4: write DCO to WORK_REQUESTS/wr-{plan}-{ts}.json
    │     │     ├─ S5: resolve_executor(registry, harness) → executor_cloud.py
    │     │     ├─ S6: subprocess.Popen(executor_cloud.py <dco_path>)
    │     │     ├─ S7: receipt + work_request status commit
    │     │     └─ S8: db.advance_cursor(role, plan_id, wr_id)
    │     │
    │     └─ S9: cursor advanced, next plan...
    │
    └─ S9: release lock, exit
```

### Within executor_cloud.py (S6 — the only LLM step)

```
executor_cloud.py <dco_path>
    │
    ├─ Parse DCO JSON
    ├─ If role != "builder": fast-path → opencode direct call → exit(0)/(3)
    │
    └─ If role == "builder": DAG execution
          │
          ├─ Topological sort of decomposition.steps
          ├─ for each ready step:
          │     ├─ Gather context (resources, prior outputs)
          │     ├─ Build structured prompt
          │     ├─ run_opencode() or run_ollama()
          │     ├─ Parse file blocks from output (START_FILE/END_FILE)
          │     └─ Write files to working directory
          │
          └─ _write_result_event() → result.json (WorkResultEvent schema)
```

### Rate-Limit Retry Loop (v090)

When the executor hits a rate limit (detected by `_detect_api_limit_error()`),
the subprocess is **not** killed and the ticket is **not** abandoned or closed.
Instead, the retry loop:

1. Inserts an `API_LIMIT` receipt for audit trail
2. Prints the rate-limit message and attempt count
3. Sleeps for `API_LIMIT_RETRY_DELAY` (default 300s / 5 minutes)
4. Retries the subprocess on the next loop iteration

The ticket stays **claimed** throughout all retries, and the session
remains active. After `API_LIMIT_MAX_RETRIES` (default 5) exhausted retries,
the ticket is closed as `failed` and a retry ticket is created via
`create_next_tickets()`.

**Key properties:**
- `total_work_seconds` accumulates only actual subprocess execution time
  (via `db.add_session_work_time()`), NOT waiting/retry sleep time
- The watchdog checks `total_work_seconds` against `WATCHDOG_STALE_SECONDS`,
  so waiting time does not count toward staleness
- 5 retries × 300s = 25 minutes of possible waiting, safely under the
  30-minute stale threshold
- The circuit breaker is NOT tripped on API_LIMIT — the pipeline keeps
  running, this plan just takes longer
- `_detect_api_limit_error()` checks output text regardless of exit code
  (not gated on `exit_code == 3`), catching stream errors like
  `FreeUsageLimitError` that arrive at exit code 0 or 1

---

## 3. Component Map

### 3.1 `nexus/python/conduit/` — Cron Orchestrator (Python)

| File                       | Purpose                                                                                     |
|----------------------------|---------------------------------------------------------------------------------------------|
| `main.py`                  | Entry point. Lock, discover, dispatch loop with rate-limit retry, cursor. `--status`, `--run`, `--all`, `--clean-test-artifacts`, `--plan`, `--supersede`, `--cancel` flags. |
| `db_adapter.py`            | SQLite adapter. Sessions, receipts, work_requests, `pipeline_cursor`, tickets, circuit breaker, `add_session_work_time()`, `create_next_tickets()`, `detect_stale/expired_tickets()`. |
| `executor_cloud.py`        | Worker process. Parses DCO, builds structured prompt, invokes opencode, writes `result.json`. |
| `executor_registry.py`     | Pydantic models for registry config. `load_registry()`, `resolve_executor()`.                |
| `work_request.py`          | Canonical WorkRequest DCO and WorkResultEvent Pydantic models.                               |
| `work_request_factory.py`  | `create_from_plan()` — converts plan DB row into a full WorkRequestDCO.                      |
| `registry.json`            | Model config (default/fallback harness+model) + executor catalogue.                          |
| `agent_chat.py`            | Local HTTP chat server (`POST /chat`) for launching agents ad-hoc.                           |

### 3.2 `nexus/typescript/conduit-mcp/` — MCP Server (TypeScript, port 3100)

| File / Module              | Purpose                                                                                     |
|----------------------------|---------------------------------------------------------------------------------------------|
| `src/index.ts`             | MCP server entry point. Starts Express + SSE on port 3100.                                  |
| `src/tools.ts`             | MCP tool definitions & handlers: `create_proposed_plan`, `promote_plan`, `issue_receipt`, `get_plan_receipts`, `query_pipeline_state`, `seed_ai_config`, etc. |
| `src/watcher.ts`           | `PipelineWatcher` — coordinates all sub-watchers, serves `/state`, creates plans (DB-authoritative). |
| `src/watchers/plan-watcher.ts` | Watches `IMPLEMENTATION_PLANS/` dirs via chokidar. DB-primary fallback when dir absent.  |
| `src/watchers/builder-watcher.ts` | Monitors builder output and result files.                                          |
| `src/watchers/cb-watcher.ts` | Circuit breaker state monitoring & auto-reset.                                           |
| `src/watchers/analytics-engine.ts` | Compute pipeline metrics (throughput, token usage, cycle times).                    |
| `src/db.ts`                | SQLite schema (all migrations v068–v090), `plan_status` view, tickets CRUD, AI config registry (v083), full CRUD for plans/receipts/sessions/circuit_breaker/tickets. |
| `src/receipts.ts`          | Receipt validation (state machine rules).                                                    |
| `src/validate.ts`          | Generic argument validation for tool calls.                                                  |
| `src/errors.ts`            | Error helpers for MCP responses.                                                             |
| `src/parser.ts`            | `.md` plan file parser (extracts plan number, title, project, etc.).                         |
| `src/types.ts`             | Shared TypeScript types (PipelineState, PlanCard, etc.).                                     |
| `src/env.ts`               | Shared `.env` loader (no `dotenv` dependency).                                               |
| `watchers/archive-watcher.ts` | Archives old plans to `.bak/`.                                                          |
| `watchers/agent-watcher.ts` | Tracks agent heartbeat and completion signals.                                             |
| `watchers/inspection-watcher.ts` | Records inspection reports.                                                            |
| `watchers/prompt-watcher.ts` | Captures prompt audit trail.                                                             |
| `watchers/changes-watcher.ts` | Records change reports.                                                                  |

### 3.3 `nexus/angular/conduit-ui/` — Angular Dashboard (port 4400)

Angular application that renders the pipeline state from the MCP server.
Shows plans grouped by status columns (proposed, planning, pending, active,
completed, blocked), receipt chains per plan, and SSE-based live updates.

Supports plan creation, editing, promotion, revision, and soft-deletion via
the Planner component. Features a Kanban board with plan cards grouped by
status, dependency graph visualization, sessions panel, inspection dashboard,
analytics dashboard, prompt catalog, changes view, archive browser, and AI
config management.

### 3.4 MCP Tools (full list)

| Tool | Description | Receipt |
|------|-------------|---------|
| `create_proposed_plan` | Capture an idea in `proposed/` | `PROPOSED` |
| `create_plan` | Create directly into `pending/` | `PLAN_CREATE` |
| `promote_plan` | Move from `proposed/` → `planning/` | `PLANNING` |
| `update_plan` | Edit plan metadata (title, goal, files, criteria, deps) | — |
| `revise_plan` | Copy a completed/blocked plan into `planning/` | `PLANNING` |
| `delete_plan` | Soft-delete (mark `deleted=1` in DB) | — |
| `issue_receipt` | Manually record a pipeline event | Any |
| `get_plan_receipts` | View the receipt chain for a plan | — |
| `query_pipeline_state` | Full PipelineState JSON | — |
| `query_inspections` | Search/filter inspection reports | — |
| `query_prompts` | Search captured prompts with lineage | — |
| `query_changes` | Search change reports | — |
| `query_analytics` | Pipeline metrics | — |
| `save_prompt` | Persist a prompt to the audit trail | — |
| `agent_heartbeat` | Agent liveness ping | — |
| `agent_finished` | Agent completion signal | — |
| `seed_ai_config` | Seed default AI provider/harness/model/config | — |

### 3.5 Plan Filesystem Layout

```
nexus/.conduit-data/
├── pipeline.db                    # SQLite — the single source of truth
├── IMPLEMENTATION_PLANS/
│   ├── proposed/                  # Ideas captured via create_proposed_plan
│   ├── planning/                  # Promoted/revision plans awaiting planner
│   ├── pending/                   # Plans with PLAN_CREATE receipt, ready for builder
│   ├── active/                    # Plans being actively implemented (IMPLEMENTATION)
│   ├── completed/                 # REVIEW_PASS plans (terminal)
│   └── blocked/                   # BLOCK or PLAN_BLOCK plans
├── WORK_REQUESTS/                 # Serialized DCO JSON files
├── INSPECTIONS/                   # Inspection/blocker reports
├── CHANGES/                       # Change reports
├── PROMPTS/                       # Captured prompt audit trail
└── .bak/                          # Archived artifacts
```

**The filesystem is a mirror, not the authority.** If a plan file exists in a
directory that contradicts its receipt chain, the receipt chain wins.
If `IMPLEMENTATION_PLANS/` doesn't exist at all, the MCP server runs in
DB-only mode.

### 3.6 Shared Database

A single SQLite database at `/home/codex/dev/nexus/.conduit-data/pipeline.db` shared by
both `conduit` (Python via `db_adapter.py`) and `conduit-mcp`
(TypeScript via `better-sqlite3`).

Key tables:
- **plans** — plan metadata (title, project, goal, files_affected, acceptance_criteria, etc.)
- **receipts** — immutable audit trail (plan_id, type, agent_role, session_id, ticket_id)
- **sessions** — agent execution sessions (start/end, exit_code, PID, `is_running`, `total_work_seconds`, `cost_usd`)
- **work_requests** — DCO artifacts (plan_id, status, dco_json)
- **pipeline_cursor** — monotonic cursor per role (last processed plan ID)
- **circuit_breaker** — single-row breaker state (tripped flag, retry_after, paused)
- **tickets** — authorization chain (id, plan_id, role, status, objective, parent_ticket_id, spawn_reason, tokens_used, expires_at, etc.)
- **ai_providers, ai_harnesses, ai_models, ai_role_config** — AI config registry (v083)

Key view:
- **plan_status** — computes `derived_status` from the receipt chain (see §4)

Key columns (v090):
- **sessions.total_work_seconds** — cumulative subprocess execution time, used by watchdog
  to determine staleness based on actual work, not wall-clock waiting time

---

## 4. Receipt State Machine

Receipts are the sole authority for plan status. The `plan_status` SQL view
computes `derived_status` from the receipt chain using priority rules.

### 4.1 Transition Graph

```
PROPOSED ──(promote)→ PLANNING ──(planner)→ PLAN_CREATE ──(builder)→ IMPLEMENTATION
       │                                                      ╱     │      ╲
       │                                           REVIEW_PASS  REVIEW   BLOCK
       │                                           (terminal,  (reviewer (stays
       │                                            self-cert)  pick-up) blocked)
       │                                                         ╱      ╲
       │                                               REVIEW_PASS    REVIEW_REJECT
       │                                               (terminal)     (back to builder)
       │
       │  ┌── Optional critic path (advisory) ──────────────────────────┐
       │  │  PLAN_CREATE ──(critic)→ CRITIQUE_PASS ──→ IMPLEMENTATION    │
       │  │                         CRITIQUE_REJECT ──→ PLANNING         │
       │  └──────────────────────────────────────────────────────────────┘
       │
       └──(re-promote)→ PLANNING  (revision cycle)
```

**Note:** The critic runs advisory on `PLAN_CREATE` plans. If the critic issues
`CRITIQUE_PASS`, the plan stays in the pending column and the builder processes it
next. If `CRITIQUE_REJECT`, the plan returns to planning for rework. Plans that
skip critic go directly from `PLAN_CREATE → IMPLEMENTATION` via builder
self-certification.

If the builder fails, it issues `BLOCK`. The CRITIQUE_REJECT state similarly
returns the plan to planning for re-elucidation.

### 4.2 All Receipt Types

| Receipt Type      | Issued By    | Meaning                                       | Next State          |
|-------------------|-------------|-----------------------------------------------|---------------------|
| PROPOSED          | user/MCP    | Idea captured; not yet planned                | PLANNING            |
| PLANNING          | MCP         | Promoted; awaiting planner elucidation        | PLAN_CREATE         |
| PLAN_CREATE       | planner     | Plan fully defined with acceptance criteria   | IMPLEMENTATION      |
| IMPLEMENTATION    | builder     | Builder started (or completed) work           | REVIEW_PASS or BLOCK|
| REVIEW            | reviewer    | Reviewer evaluating the implementation        | REVIEW_PASS/REJECT  |
| REVIEW_PASS       | reviewer    | Implementation accepted                       | (terminal)          |
| REVIEW_REJECT     | reviewer    | Implementation rejected; back to builder      | IMPLEMENTATION      |
| BLOCK             | builder     | Builder hit an error or timeout               | (stays blocked)     |
| PLAN_BLOCK        | planner     | Planner could not elucidate the plan          | (stays blocked)     |
| CRITIQUE          | critic      | Critic evaluating the plan                    | CRITIQUE_PASS/REJECT|
| CRITIQUE_PASS     | critic      | Plan passes critique; ready for builder       | IMPLEMENTATION      |
| CRITIQUE_REJECT   | critic      | Plan fails critique; back to planning         | PLANNING            |

### 4.3 `plan_status` View Logic

The `plan_status` view resolves `derived_status` with these priority rules:

1. **REVIEW_PASS is terminal** — once a plan has REVIEW_PASS, it stays
   "completed" regardless of later receipts.
2. **REVIEW_REJECT resists BLOCK** — if the most recent non-BLOCK receipt is
   REVIEW_REJECT, the plan stays in "active" (not blocked). A subsequent
   IMPLEMENTATION receipt can override it (re-work).
3. **Default: most recent wins** — for all other plans, `derived_status` is the
   most recent receipt type, excluding PROPOSED/PLANNING if a later execution
   receipt exists.
4. **No receipts = no state** — plans with zero receipts have NULL derived_status
   and don't appear in any column.

---

## 4.4 Ticket Lifecycle (v078–v090)

Tickets own the authorization chain. No work happens without a claimed ticket.

### Ticket States

```
                    ┌──────────┐
                    │   open   │
                    └────┬─────┘
                         │ claim_ticket()
                         ▼
                    ┌──────────┐
                    │ claimed  │◄──── retry loop holds claim
                    └────┬─────┘
                         │ close_ticket()
                         ▼
              ┌──────────────────────┐
              │ completed │  failed  │◄──── terminal
              └──────┬────────────────┘
                     │ create_next_tickets()
                     ▼
              ┌──────────────────┐
              │  open (next role)│
              └──────────────────┘
```

Also: `stale` (6h idle in claimed), `expired` (24h TTL), `superseded` / `cancelled` (manual intervention).

### Ticket Creation Mapping (`create_next_tickets`)

| Terminal State | Role        | Next Tickets        |
|---------------|-------------|---------------------|
| completed    | builder     | reviewer            |
| completed    | planner     | builder + critic    |
| completed    | critic      | builder             |
| completed    | reviewer    | (terminal)          |
| failed       | builder     | (nothing—BLOCK)     |
| failed       | reviewer    | builder (re-implement) |
| failed       | planner     | planner (retry)     |

### Ticket Lifecycle Management

- **Staleness:** Tickets claimed for 6+ hours without activity are auto-marked `stale`, forcing reauthorization
- **Expiration:** All tickets have a 24-hour TTL. Open/claimed/stale tickets past expiration are marked `expired`
- **Supersede:** Manual replacement of a ticket (with optional replacement creation)
- **Cancel:** Explicit denial of authorization (terminal)

---

## 5. DCO Lifecycle (WorkRequest)

### 5.1 Creation

`WorkRequestFactory.create_from_plan()` transforms a plan DB row into a
structured JSON document conforming to the WorkRequest DCO schema:

```
Plan Row (DB)  ──Factory──→  WorkRequestDCO (JSON)
  id: "0069"                   id: "wr-0069-1718123456"
  title: "Add dark mode"       intent: { problem, outcome, priority, ... }
  goal: "..."                  decomposition: { strategy, steps[step_1...] }
  acceptance_criteria: [...]   requirements: { functional: [...] }
  files_affected: [...]        constraints: { safety_constraints: [...] }
                               success_criteria: { completion_conditions: [...] }
                               execution_state: { status: "pending", ... }
                               metadata: { harness, model, role, ... }
```

### 5.2 Serialization

Written to `/home/codex/dev/nexus/.conduit-data/WORK_REQUESTS/wr-{plan}-{ts}.json` and
stored in the `work_requests` table.

### 5.3 Execution

`executor_cloud.py` reads the DCO, builds a structured prompt via
`_serialize_dco_for_prompt()`, and invokes opencode:

```
opencode run --agent <role> --print-logs --log-level DEBUG --model <model> "<prompt>"
```

### 5.4 Result

On completion, `_write_result_event()` produces `result.json` conforming to the
`WorkResultEvent` schema:

```json
{
  "work_request_id": "wr-0069-1718123456",
  "status": "success",
  "files_written": ["README.md"],
  "outputs": [],
  "artifacts": [],
  "error": null,
  "timestamp": "2025-06-07T12:34:56Z",
  "executor_id": "executor-cloud",
  "harness": "opencode",
  "model": "opencode/big-pickle"
}
```

---

## 6. Cursor System

Each role has a monotonic cursor in `pipeline_cursor`:

| Role     | Eligible Plans (derived_status)         |
|----------|----------------------------------------|
| builder  | PLAN_CREATE, REVIEW_REJECT             |
| reviewer | IMPLEMENTATION                         |
| planner  | PROPOSED, PLANNING                     |
| critic   | PLAN_CREATE                            |

Eligibility is **ticket-driven** (v079): plans must have an open,
non-stale, non-expired ticket for the role. The cursor records
`(role, last_processed_plan_id, last_work_request_id)` and advances
monotonically after each plan. Plans are processed in `created_at ASC`
order. Once a cursor passes a plan, the plan is processed at most once per
role per cycle.

The reviewer has a 60-second cooldown before becoming eligible — this avoids
race conditions where reviewer tickets are created and immediately consumed
before the builder's IMPLEMENTATION receipt is finalized.

---

## 7. CLI Reference

```bash
# Print pipeline status (no lock required)
python3 main.py --status

# Run a specific role
python3 main.py --run planner

# Run all roles sequentially
python3 main.py --all

# Dispatch a single plan (bypasses cursor/pause checks)
python3 main.py --plan 0075 [--force]

# Clean test artifacts (BLOCK receipts from exit code 3 sessions)
python3 main.py --clean-test-artifacts

# Supersede a ticket (mark terminal, optionally create replacement)
python3 main.py --supersede ticket-0075-builder-1234567 [--supersede-replace] [--supersede-reason "reason"]

# Cancel a ticket (explicit denial of authorization)
python3 main.py --cancel ticket-0075-builder-1234567 [--cancel-reason "reason"]
```

---

## 8. Setup & Operations

### 8.1 Environment Configuration

Environment variables are loaded from a `.env` file by a shared loader module
so every entry-point uses the same logic without any external dependency.

- **Python** — `env_config.py` (imported by `main.py` and `executor_cloud.py`)
- **TypeScript** — `src/env.ts` (imported by `src/index.ts`)

Copy `.env.example` to `.env` and adjust paths for your machine:

```bash
cp .env.example .env          # in nexus/python/conduit/
cp .env.example .env          # in nexus/typescript/conduit-mcp/
```

#### `.env` (loaded by `env_config.py`)

| Variable                        | Default                                                    | Purpose                                |
|--------------------------------|------------------------------------------------------------|----------------------------------------|
| `PIPELINE_DB_PATH`            | `/home/codex/dev/nexus/.conduit-data/pipeline.db`                     | SQLite database path                   |
| `PIPELINE_LOCK_PATH`          | `/tmp/pipeline-manager.lock`                               | Lock file (prevents concurrent runs)   |
| `PIPELINE_DCO_DIR`            | `/home/codex/dev/nexus/.conduit-data/WORK_REQUESTS`                   | Where WorkRequest DCOs are written     |
| `PIPELINE_ROOT`               | (derived from `PIPELINE_DB_PATH`)                          | Project root for executor artifacts    |
| `OPENCODE_BIN`                | `/home/codex/.opencode/bin/opencode`                       | Path to the opencode binary            |
| `PIPELINE_EXECUTOR_TIMEOUT`   | `1800`                                                     | Subprocess timeout in seconds          |
| `PIPELINE_WATCHDOG_STALE`     | `1800`                                                     | Max cumulative work seconds before stale kill (v090: checks total_work_seconds, not wall-clock) |
| `PIPELINE_LOCK_STALE`         | `3600`                                                     | Lock staleness threshold               |
| `API_LIMIT_RETRY_DELAY`       | `300` (5 min)                                              | Sleep between rate-limit retries        |
| `API_LIMIT_MAX_RETRIES`       | `5`                                                        | Max retry attempts per plan-role        |
| `MCP_BASE_URL`               | `http://localhost:3100`                                    | MCP server URL for plan sync            |

#### `.env` (loaded by `src/env.ts`)

| Variable       | Default              | Purpose                                |
|----------------|----------------------|----------------------------------------|
| `PIPELINE_DIR` | `../../../.conduit-data`    | Root of the conduit data directory      |
| `PORT`         | `3100`               | HTTP server port                       |

Both loaders skip comments, ignore empty lines, strip quotes, and **never
override** variables already set in the environment (shell env vars take
precedence over `.env`).

### 8.2 Crontab

```
*/3 * * * * cd /home/codex/dev/nexus/python/conduit && python3 main.py --all >> /tmp/pipeline-manager.log 2>&1
```

### 8.3 MCP Server

```
cd /home/codex/dev/nexus/typescript/conduit-mcp
npx tsx src/index.ts    # port 3100
```

### 8.4 Pipeline Viewer

```
cd /home/codex/dev/nexus/angular/conduit-ui
ng serve                # port 4400
```

### 8.5 MCP Server Endpoints

| Endpoint         | Description                            |
|------------------|----------------------------------------|
| `/state`         | Full PipelineState JSON                |
| `/tools`         | Available MCP tools (GET)              |
| `/tools/call`    | Invoke a tool (POST JSON-RPC-style)    |
| `/events`        | Server-Sent Events stream              |
| `/health`        | Health check                           |
| `/sessions`      | Session history                        |

### 8.6 Operational Commands

```bash
# Check if MCP server is healthy
curl -s http://localhost:3100/state | python3 -m json.tool | head -20

# Check pipeline status
cd /home/codex/dev/nexus/python/conduit && python3 main.py --status

# Clean stale lock
rm -f /tmp/pipeline-manager.lock

# Clean stale sessions
sqlite3 /home/codex/dev/nexus/.conduit-data/pipeline.db \
  "UPDATE sessions SET is_running=0, end_iso=datetime('now') WHERE is_running=1;"

# View receipt chain for a plan
curl -s -X POST http://localhost:3100/tools/call \
  -H 'Content-Type: application/json' \
  -d '{"name":"get_plan_receipts","arguments":{"plan_id":"0069"}}'
```

---

## 9. Design Principles

1. **Receipts are the sole authority** — no filesystem state determines plan
   status. A plan's position in the pipeline is derived exclusively from its
   receipt chain. Writing `.md` files directly to `IMPLEMENTATION_PLANS/`
   without issuing a receipt produces invisible, orphaned plans.
2. **No inference on idle** — discovery is SQL-only. Zero active work = zero
   LLM calls = zero token bleed.
3. **Monotonic cursor** — each plan is processed at most once per role. The
   cursor never rewinds.
4. **Single-process lock** — only one `pipeline-manager` instance runs at a time.
   No distributed locking needed.
5. **Immutable receipts** — receipts are append-only. State is computed from
   the chain, never mutated in place.
6. **Soft-delete, not hard-delete** — plans are marked `deleted=1` in the DB
   rather than physically removed. The audit trail (receipts) is preserved.
   Block artifacts on disk are cleaned up when a blocked plan is deleted.
7. **DB-primary resilience** — if `IMPLEMENTATION_PLANS/` directory doesn't exist,
   the MCP server falls back to DB-only mode. The filesystem is a mirror, not
   the authority.
8. **Work-time staleness** — the watchdog checks `total_work_seconds` (cumulative
   subprocess execution time), not wall-clock idle time. Rate-limit retry waits
   do not count toward staleness.
9. **Retry in place, don't abandon** — when a rate limit is hit, the ticket stays
   claimed and the subprocess is retried after a 5-minute delay. The circuit
   breaker is not tripped. After 5 failed retries, the ticket closes as `failed`
   and a retry ticket is created.

---

## 10. Anti-Patterns

### Writing `.md` files directly to `IMPLEMENTATION_PLANS/pending/`

**Symptom:** Plan file exists but plan doesn't appear in the pipeline viewer
or get picked up by any role.

**Root cause:** No receipt was issued. The `plan_status` view computes
`derived_status` from receipts, not files. A plan with zero receipts has
NULL `derived_status` and is invisible.

**Fix:** Delete the orphaned file. Create the plan through `create_proposed_plan`
or `create_plan` (via MCP API or conduit-ui). Also check for DB-only
ghosts — plans with NULL `derived_status` and no receipts that may persist
even after files are deleted:
```bash
sqlite3 /home/codex/dev/nexus/.conduit-data/pipeline.db \
  "SELECT id, title FROM plan_status WHERE derived_status IS NULL AND deleted=0;"
```

### Placing a plan file in the wrong directory

**Symptom:** Plan appears in an unexpected column in the pipeline viewer.

**Root cause:** Receipt chain determines column, not filesystem location.
If a receipt says `IMPLEMENTATION` but the file is in `blocked/`, the plan
appears in the Active column.

**Fix:** Move the file to the correct directory for consistency (the
plan-watcher will log a reconciliation warning), but the receipt chain is
what matters for pipeline behavior.

### Rate-limit retries burning credits without circuit breaker

**Symptom:** Repeated `FreeUsageLimitError` in logs, pipeline doesn't pause.

**Root cause (pre-v090):** The circuit breaker was the only defense against
rate-limit loops, but it was only triggered on `exit_code == 3`. Stream
errors like `FreeUsageLimitError` arrive at exit code 0/1 and bypassed
detection entirely.

**Fix (v090):** `_detect_api_limit_error()` now checks output text regardless
of exit code. The retry loop sleeps 5 minutes between attempts, keeping the
ticket claimed. After 5 exhausted retries, the ticket closes as `failed`
and a retry ticket is created. The circuit breaker is no longer involved.

### Watchdog killing sessions during rate-limit waits

**Symptom:** Session killed while waiting for rate-limit retry.

**Root cause (pre-v090):** Watchdog checked wall-clock `last_activity`
elapsed. The `update_session_activity()` refresh before retry sleep was
papering over the real issue.

**Fix (v090):** Watchdog now checks `total_work_seconds` (cumulative
subprocess execution time), so waiting time doesn't count toward staleness.
The `update_session_activity()` call before retry sleep was removed —
waiting is not activity.

### Circuit breaker tripped on API limits despite retry loop

**Symptom:** Pipeline paused unnecessarily after a rate-limit retry.

**Root cause (pre-v090):** The API_LIMIT handler called
`db.trip_circuit_breaker()` and `db.set_conduit_paused(True)`, halting the
entire pipeline for a transient rate limit affecting a single plan.

**Fix (v090):** The retry loop keeps the ticket claimed and sleeps in place.
No circuit breaker trip, no conduit pause. The pipeline continues processing
other plans and roles unaffected.
