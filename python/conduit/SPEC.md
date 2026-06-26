# Conduit — Specification

## Functional Requirements

- Orchestrate the WorkRequest pipeline from cron trigger to execution and audit
- Lock pipeline execution to prevent concurrent runs (single-instance guarantee)
- Discover eligible plans per role via SQL queries against the plan_status view
- Normalize plan metadata into structured WorkRequest DCO documents
- Dispatch work to configured executors (opencode, ollama)
- Retry rate-limited plans in-place without abandoning the ticket
- Advance monotonic cursors per role to ensure at-most-once processing
- Maintain circuit breaker state for downstream API health
- Write immutable receipt chain and WorkResultEvent artifacts for audit trail

## Non-Functional Requirements

- Idle cycle: zero LLM calls when no eligible plans exist
- Lock-acquire timeout: immediate fail if pipeline is already running
- Rate-limit retry: 5 attempts with 300s delay each, ticket stays claimed
- Session watchdog: stale detection based on cumulative work seconds, not wall-clock time
- Cursor never rewinds — each plan is processed at most once per role per cycle

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| (CLI) | `--status` | Print pipeline status |
| (CLI) | `--run <role>` | Run a specific role |
| (CLI) | `--all` | Run all roles sequentially |
| (CLI) | `--plan <id> [--force]` | Dispatch a single plan |
| (CLI) | `--supersede <ticket>` | Supersede a ticket |
| (CLI) | `--cancel <ticket>` | Cancel a ticket |
| (CLI) | `--clean-test-artifacts` | Clean BLOCK artifacts from test runs |

## Data Model

- WorkRequestDCO: id (UUID), planId (String), intent (Object), decomposition (Object), requirements (Object), constraints (Object), successCriteria (Object), metadata (Object)
- WorkResultEvent: workRequestId (UUID), status (String), filesWritten (String[]), outputs (String[]), error (String), timestamp (String), executorId (String)
- PipelineCursor: role (String), lastProcessedPlanId (String), lastWorkRequestId (String)
- CircuitBreaker: tripped (Boolean), retryAfter (Instant), paused (Boolean)
- Ticket: id (UUID), planId (String), role (String), status (String), expiresAt (Instant)
