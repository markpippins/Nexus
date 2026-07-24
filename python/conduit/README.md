# Conduit

Cron-driven orchestrator that consumes the **PostgreSQL `nexus` database** and dispatches
WorkRequests to AI executors via a model chain with primary + fallback models.

**Receipt-first architecture:** Plan state is determined exclusively by the
receipt chain, not filesystem location. Always use MCP tools or the conduit-ui
Angular dashboard to create plans — writing `.md` files directly to
`IMPLEMENTATION_PLANS/` will produce invisible, orphaned plans.

**Model chain resilience:** When the primary model fails (rate limit, error),
Conduit falls back through a chain of configured models automatically. After
all models are exhausted, a retry ticket is created.

**Execution Authority (ADR-006):** Every dispatch acquires a lease, creates
attempts, and issues execution receipts — providing mutual exclusion and a
full audit trail independent of the executor.

## Quick Start

```bash
# 1. Copy and edit the environment file
cp .env.example .env
# Set CONDUIT_PG_DSN to your PostgreSQL connection string

# 2. Check status (no lock required, read-only)
python3 main.py --status

# 3. Run the full pipeline (acquires lock, processes all roles)
python3 main.py --all
```

## Plan Lifecycle

```
Propose → Promote → Plan → Build → Review

1. Capture an idea     create_proposed_plan  → PROPOSED receipt, file in proposed/
2. Promote to planning  promote_plan          → PLANNING receipt, file in planning/
3. Planner elucidates   (cron: planner role)   → PLAN_CREATE receipt, file in pending/
4. Builder implements   (cron: builder role)   → IMPLEMENTATION receipt, file in active/
5. Reviewer approves    (cron: reviewer role)  → REVIEW_PASS receipt, file in completed/
```

For the full architecture, receipt state machine, anti-patterns, and component map, see
[ARCHITECTURE.md](./ARCHITECTURE.md). For a quick reference of commands and env vars, see
[REFERENCE.md](./REFERENCE.md).

## Environment

All paths are read from `.env` (or environment variables). See `.env.example`
for the complete list. Conduit uses **PostgreSQL exclusively** — there is no
SQLite fallback.

| Variable                    | Default                                                    | Purpose                                |
|----------------------------|------------------------------------------------------------|----------------------------------------|
| `CONDUIT_PG_DSN`           | *(required)*                                               | PostgreSQL connection string           |
| `CONDUIT_PG_SCHEMA`        | `conduit`                                                  | PostgreSQL schema name                 |
| `CONDUIT_DATA_DIR`         | `/home/codex/dev/nexus/.conduit-data`                      | Conduit data directory                 |
| `CONDUIT_LOG_PATH`         | `$CONDUIT_DATA_DIR/conduit.log`                            | Structured log file path               |
| `CONDUIT_LOG_LEVEL`        | `INFO`                                                     | Log level (DEBUG, INFO, WARNING, ERROR)|
| `PIPELINE_LOCK_PATH`       | `/tmp/pipeline-manager.lock`                               | Prevents concurrent runs               |
| `PIPELINE_DCO_DIR`         | `/home/codex/dev/nexus/.conduit-data/WORK_REQUESTS`        | DCO output directory                   |
| `PIPELINE_ROOT`            | `/home/codex/dev`                                          | Project root for executor artifacts    |
| `OPENCODE_BIN`             | `/home/codex/.opencode/bin/opencode`                       | Path to the opencode binary            |
| `PIPELINE_EXECUTOR_TIMEOUT`| `1800`                                                     | Subprocess timeout in seconds          |
| `PIPELINE_WATCHDOG_STALE`  | `1500`                                                     | Max cumulative work seconds before stale kill |
| `PIPELINE_LOCK_STALE`      | `3600`                                                     | Lock staleness threshold (seconds)     |
| `API_LIMIT_RETRY_DELAY`    | `300` (5 min)                                              | Sleep between rate-limit retries       |
| `API_LIMIT_MAX_RETRIES`    | `5`                                                        | Max retry attempts per plan-role       |
| `MCP_BASE_URL`             | `http://localhost:3100`                                    | MCP server URL for plan sync           |
| `PIPELINE_MODEL`           | *(optional)*                                               | Fallback model when tackle-mcp unavailable |

The `.env` loader lives in `env_config.py` — a shared module imported by both
`main.py` and `executor_cloud.py`. No `python-dotenv` dependency needed.

## CLI

```bash
python3 main.py --status                          # Pipeline observability report
python3 main.py --run planner                     # Run a single role (planner, builder, reviewer, critic)
python3 main.py --all                             # Run all roles sequentially (reviewer, planner, builder, critic)
python3 main.py --plan 0075 [--force]             # Dispatch a single plan (bypasses cursor/pause)
python3 main.py --clean-test-artifacts            # Remove test BLOCK receipts
python3 main.py --supersede ticket-id [--supersede-replace] [--supersede-reason "reason"]
python3 main.py --cancel ticket-id [--cancel-reason "reason"]
python3 main.py --kernel-sync                     # One-shot sync receipts to WRP Kernel Runtime
python3 main.py --kernel-sync-daemon              # Run kernel sync in continuous poll loop
```

## Crontab

```bash
# Pipeline orchestrator (every 3 min)
*/3 * * * * cd /home/codex/dev/nexus/python/conduit && python3 main.py --all >> /tmp/pipeline-manager.log 2>&1

# Agent scheduler (every minute — launches due agents from tackle.agent_scheduler)
* * * * * cd /home/codex/dev/nexus/python/conduit && python3 agent_scheduler_runner.py >> /tmp/agent-scheduler.log 2>&1
```

## Components

| File / Module              | Purpose |
|---------------------------|---------|
| `main.py`                  | Entry point. Lock, discover, dispatch with model chain + retry loop, cursor. All CLI flags. |
| `db_adapter.py`            | PostgreSQL adapter. Tickets, receipts, work_requests, cursors, circuit breaker, sessions, leases, attempts, execution receipts, agent budgets. |
| `executor_cloud.py`        | Worker process. Parses DCO, builds structured prompt, invokes opencode, writes `result.json`. |
| `executor_registry.py`     | Pydantic models for registry config. `load_registry()`, `resolve_executor()`. |
| `work_request.py`          | Canonical WorkRequest DCO and WorkResultEvent Pydantic models. |
| `work_request_factory.py`  | `create_from_plan()` — converts plan DB row into a full WorkRequestDCO. |
| `token_estimator.py`       | Token estimation (tiktoken) and cost estimation from pricing tables. |
| `env_config.py`            | Shared `.env` loader. |
| `agent_scheduler_runner.py`| Launches due agents from `tackle.agent_scheduler` on cron. |
| `cli_executor.py`          | Standalone executor proving the Execution Authority abstraction. |
| `ccnf_bridge.py`           | CCNF conformance bridge for deterministic canonicalization and execution receipts. |
| `bridge/`                  | Conduit → WRP Kernel bridge. Polls `vision.receipts`, maps to KernelDeltas, feeds the in-process Kernel Runtime. |
| `wrp_kernel/`              | Deterministic, replayable WRP Kernel Runtime (engine, identity, graph, lineage, snapshots). |
| `app/`                     | FastAPI Kernel Runtime API server (port 3103). Delta ingestion, state inspection, replay, Prometheus metrics. |
| `schema.sql`               | Reference SQL schema (MCP server is the schema authority). |

## Key Features

### Model Chain (Primary + Fallbacks)

When dispatching work, Conduit resolves a model chain from the database
(via tackle-mcp) rather than a single model:

1. **Primary** — from `get_role_model_config(role)`
2. **Fallbacks** — from `get_fallback_models(role)`, ordered by priority
3. **PIPELINE_MODEL env var** — ultimate fallback

Each model in the chain is tried in order. If one fails (non-rate-limit),
the next fallback is attempted. Rate-limited models are retried in place
(up to `API_LIMIT_MAX_RETRIES` attempts with `API_LIMIT_RETRY_DELAY` sleep
between each).

### Execution Authority (ADR-006)

Every dispatch follows the Execution Authority protocol:

1. **Acquire Lease** — mutual exclusion per request (TTL-based)
2. **Create Attempt** — records who started work and when
3. **Start Attempt** — marks the attempt as in-progress
4. **Complete Attempt** — final status (SUCCEEDED, FAILED, FATAL_ERROR)
5. **Issue Execution Receipt** — immutable audit trail
6. **Release Lease** — frees the request for other executors

This protocol is executor-agnostic — both `executor_cloud.py` and
`cli_executor.py` implement it identically.

### Rate-Limit Resilience

When the executor hits a rate limit, the pipeline retries in place
(5 retries, 5-minute delay each). The ticket stays claimed and the
circuit breaker is not tripped. Only actual execution time counts
toward session staleness — waiting time is excluded. After all
retries are exhausted, the ticket closes as `failed` and a retry
ticket is created for the next cycle.

### Budget Enforcement

Before dispatch, Conduit checks two budget ceilings:

- **Agent budget** — per-role USD ceiling (`tackle.agent_budget_usage`)
- **Ticket budget** — per-ticket cost ceiling

If either is exceeded, the plan is blocked with a `BLOCK` receipt
and exit code 4 (budget exceeded).

### WRP Kernel Bridge

The `bridge/` module syncs conduit receipts to the in-process
WRP Kernel Runtime. It polls `vision.receipts` for new entries,
enriches them with plan data from `nebula.plans`, maps each receipt
deterministically to kernel format, and reduces them through the
kernel engine in batches.

```bash
# One-shot sync
python3 main.py --kernel-sync

# Continuous daemon
python3 main.py --kernel-sync-daemon
```

### Kernel Runtime API

The `app/` module provides a FastAPI server (port 3103) exposing:

| Endpoint       | Description |
|---------------|-------------|
| `POST /delta`  | Ingest a KernelDelta batch |
| `GET /state`   | Inspect current KernelState |
| `GET /replay`  | Replay deltas from a snapshot |
| `GET /metrics` | Prometheus metrics endpoint |
| `GET /healthz` | Liveness probe |
| `GET /readyz`  | Readiness probe (checks DB + engine) |
