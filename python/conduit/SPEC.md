# Conduit — Specification

## Functional Requirements

- Orchestrate the WorkRequest pipeline from cron trigger to execution and audit
- Lock pipeline execution to prevent concurrent runs (single-instance guarantee)
- Discover eligible plans per role via SQL queries against the plan_status view
- Normalize plan metadata into structured WorkRequest DCO documents
- Resolve model chains (primary + fallbacks) from database config (tackle-mcp)
- Dispatch work to configured executors (opencode, ollama, custom harnesses)
- Acquire leases and create attempts per Execution Authority (ADR-006)
- Retry rate-limited plans in-place without abandoning the ticket
- Fall back through model chain on non-rate-limit failures
- Advance monotonic cursors per role to ensure at-most-once processing
- Maintain circuit breaker state (global + per-role) for downstream API health
- Enforce agent and ticket budget ceilings before dispatch
- Write immutable receipt chain, execution receipts, and WorkResultEvent artifacts for audit trail
- Sync receipts to the WRP Kernel Runtime for deterministic state reconstruction

## Non-Functional Requirements

- **PostgreSQL-only** — no SQLite fallback. `CONDUIT_PG_DSN` is required.
- Idle cycle: zero LLM calls when no eligible plans exist
- Lock-acquire timeout: immediate fail if pipeline is already running
- Rate-limit retry: 5 attempts with 300s delay each, ticket stays claimed
- Session watchdog: stale detection based on cumulative work seconds (`total_work_seconds`), not wall-clock time
- Cursor never rewinds — each plan is processed at most once per role per cycle
- Model chain: primary model fails → fallback models tried in priority order → `PIPELINE_MODEL` env var as ultimate fallback
- Budget enforcement: agent-level and ticket-level cost ceilings checked before dispatch
- Execution Authority: every work unit acquires a lease, creates attempts, and issues execution receipts

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| (CLI) | `--status` | Print pipeline status including cursor, eligible plans, tokens |
| (CLI) | `--run <role>` | Run a specific role (planner, builder, reviewer, critic) |
| (CLI) | `--all` | Run all roles sequentially in pipeline order |
| (CLI) | `--plan <id> [--force]` | Dispatch a single plan (bypasses cursor/pause checks) |
| (CLI) | `--supersede <ticket>` | Supersede a ticket |
| (CLI) | `--cancel <ticket>` | Cancel a ticket |
| (CLI) | `--clean-test-artifacts` | Clean BLOCK artifacts from test runs |
| (CLI) | `--kernel-sync` | One-shot sync receipts to WRP Kernel Runtime |
| (CLI) | `--kernel-sync-daemon` | Run kernel sync in continuous poll loop |

## Data Model

PostgreSQL is the canonical store. Key tables span multiple schemas:

**conduit schema** (Python pipeline manager):
- `work_requests` — DCO artifacts (id, plan_id, status, dco_json)
- `pipeline_cursor` — monotonic cursor per role (role, last_processed_plan_id)
- `sessions` — agent execution sessions with `total_work_seconds` and `cost_usd`
- `circuit_breaker` — single-row breaker state (tripped, retry_after, paused)
- `bridge_checkpoint` — cursor for conduit→kernel receipt bridge

**vision schema** (MCP server):
- `receipts` — immutable audit trail (plan_id, type, agent_role, session_id, ticket_id, tokens_used, metadata_json, recorded_on_dt)
- `tickets` — authorization chain (id, plan_id, role, status, objective, parent_ticket_id, spawn_reason, expires_at)

**nebula schema** (MCP server):
- `plans` — plan metadata (title, project, goal, files_affected, acceptance_criteria, dependencies)
- `plan_status` — view computing `derived_status` from the receipt chain

**execution schema** (ADR-006):
- `requests` — execution requests (id, title, objective, status)
- `leases` — time-bound mutual exclusion (request_id, executor_id, status, expires_at)
- `attempts` — discrete execution attempts (lease_id, request_id, status, result)
- `receipts` — immutable execution receipts (attempt_id, request_id, type, agent_role)

**tackle schema** (AI config registry):
- `agent_scheduler` — scheduled agent entries (role, model_id, harness, schedule_type)
- `agent_budget_usage` — per-role cost tracking (ceiling_usd, current_usd)

### Canonical Types

- **WorkRequestDCO**: id (UUID), planId (String), intent (Object), decomposition (Object), requirements (Object), constraints (Object), successCriteria (Object), metadata (Object)
- **WorkResultEvent**: workRequestId (UUID), status (String), filesWritten (String[]), outputs (String[]), error (String), timestamp (String), executorId (String)
- **PipelineCursor**: role (String), lastProcessedPlanId (String), lastWorkRequestId (String)
- **CircuitBreaker**: tripped (Boolean), retryAfter (Instant), paused (Boolean)
- **Ticket**: id (UUID), planId (String), role (String), status (String), expiresAt (Instant), objective (String), costBudgetUsd (Float)
- **ExecutionLease**: id (UUID), requestId (UUID), executorId (String), status (String), expiresAt (Instant), ttlSeconds (Integer)
- **ExecutionAttempt**: id (UUID), leaseId (UUID), requestId (UUID), status (String), result (JSON), exitCode (Integer)
- **KernelDelta**: deltaId (String), batchId (String), receipts (List), affectedPlans (Set) — fed to the in-process Kernel Engine
