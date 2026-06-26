# Conduit → Temporal Conversion Plan

## Scope & Boundary

**What moves to Temporal:** Agent process orchestration — spawning, monitoring,
retry/fallback chains, session lifecycle, circuit breaker, cursor advancement,
and the plan→ticket→receipt state machine.

**What stays in Conduit:** The PostgreSQL schema (plans, receipts, tickets,
sessions, circuit_breaker, work_requests, pipeline_cursor), the WorkRequest DCO
system, the Angular UI, the MCP server (as API gateway), and the interactive
agent chat server (`agent_chat.py`).

**TL;DR:** `main.py:_dispatch_one` (~300 lines of nested retry/fallback logic)
becomes a Temporal Workflow. `executor_cloud.py`'s subprocess execution becomes
Temporal Activities. Everything else stays.

---

## 1. Current Architecture (What We Have)

### 1.1 The Orchestration Core (`main.py`)

The heart of the system is `_dispatch_one()`, which for each eligible plan:

```
claim_ticket → build WorkRequest DCO → build model chain →
  for each model in chain:
    for each retry attempt:
      spawn subprocess (executor_cloud.py) →
      communicate(timeout) →
      parse output (tokens, errors) →
      if success: advance cursor, close ticket, create next tickets → return
      if rate-limit: sleep, retry same model →
      if hard failure: move to next fallback model →
  if all exhausted: trip circuit breaker, requeue plan
```

This is ~300 lines with 4 levels of nesting and manual error classification.

### 1.2 Process Management

- `subprocess.Popen` with `start_new_session=True` (process group isolation)
- `proc.communicate(timeout=EXECUTOR_TIMEOUT_SECONDS)` with `TimeoutExpired` handling
- `_kill_process_tree()` → `os.killpg()` → `os.kill()` fallback
- Exit code parsing + stdout scanning for API limit patterns
- No stderr capture (merged into stdout)
- PID tracked in DB for external kill (MCP `/sessions/:id/kill`)

### 1.3 Failure Recovery

- Circuit breaker: DB row (`circuit_breaker` table), trip on all-models-exhausted
- Retry: configurable per-model retries with sleep between attempts
- Fallback chain: primary model → fallback_1 → fallback_2 (from `ai_role_models`)
- Orphan detection: `ps -eo pid,etime,cmd` scan every cycle
- Stale session detection: PID check + work-time check
- Lock file: `fcntl.flock` with stale-break via `os.kill(pid, 0)` check

### 1.4 Session Lifecycle

- `db.create_session()` → INSERT into `sessions` table
- `db.update_session_activity()` → UPDATE pid, last_activity
- `db.add_session_work_time()` → accumulate work seconds
- `db.close_session()` → UPDATE end_iso, is_running=0, exit_code
- External kill: MCP `/sessions/:id/kill` → `process.kill(-pid, SIGKILL)` → `db.endSession()`

### 1.5 What Already Works Well (Keep)

- **WorkRequest DCO system** (`work_request_factory.py`, `work_request.py`) — clean pydantic models, JSON serialization, DCO file output
- **DB schema** — well-normalized, ticket/receipt invariants enforced
- **AI config registry** — providers/harnesses/models/role-configs in DB
- **Angular UI** — sessions table, log viewer, kill/restart, circuit breaker dialog
- **MCP server** — Express API, SSE broadcasting, tool handlers
- **Agent chat** (`agent_chat.py`) — lightweight, SSE-based, in-memory sessions

---

## 2. Target Architecture (Where We're Going)

### 2.1 Temporal Concepts → Conduit Mapping

| Temporal Concept | Conduit Equivalent |
|---|---|
| **Workflow** | Plan execution lifecycle (claim→build→execute→receipt→advance) |
| **Activity** | Individual operations: build DCO, spawn opencode, parse output, insert receipt, advance cursor |
| **Child Workflow** | Per-role execution (builder workflow, reviewer workflow) |
| **Signal** | Cancel/kill from UI, pause/resume, circuit breaker trip |
| **Query** | Session status, output lines, token usage |
| **Retry Policy** | Per-model retry config + fallback chain |
| **Task Queue** | Role-specific queues (builder-queue, reviewer-queue, etc.) |
| **Worker** | Python process running Temporal activities (replaces executor_cloud.py subprocess) |

### 2.2 High-Level Flow

```
User/UI creates plan → MCP inserts into plans table
                         ↓
Cron trigger (or manual) → StartPlanWorkflow(plan_id)
                         ↓
PlanWorkflow:
  1. Activity: ClaimTicket(plan_id, role) → ticket_id
  2. Activity: BuildWorkRequestDCO(plan_id, role) → dco_json
  3. Activity: ResolveModelChain(role) → [model_configs]
  4. For each model in chain:
       Activity: ExecuteWithModel(model_config, dco_json, ticket_id) → result
       If success → break
       If rate_limit → continue (activity auto-retries based on RetryPolicy)
       If failure → continue to next model
  5. If success:
       Activity: InsertReceipt(SUCCESS, ticket_id)
       Activity: AdvanceCursor(role, plan_id)
       Activity: CreateNextTickets(plan_id, role)
       StartChildWorkflow for next role (reviewer, critic)
  6. If all models exhausted:
       Activity: TripCircuitBreaker(plan_id, error)
       Activity: RequeuePlan(plan_id)
```

### 2.3 What the Code Looks Like After

```python
# plan_workflow.py — Temporal Workflow (deterministic, no I/O)

@workflow.defn
class PlanExecutionWorkflow:
    @workflow.run
    async def run(self, plan_id: str, role: str) -> str:
        # Step 1: Claim authority
        ticket_id = await workflow.execute_activity(
            claim_ticket,
            args=[plan_id, role],
            start_to_close_timeout=timedelta(seconds=10),
        )
        if not ticket_id:
            return "skipped"

        # Step 2: Build the work request
        dco_json = await workflow.execute_activity(
            build_work_request_dco,
            args=[plan_id, role],
            start_to_close_timeout=timedelta(seconds=5),
        )

        # Step 3: Resolve model chain from DB
        model_chain = await workflow.execute_activity(
            resolve_model_chain,
            args=[role],
            start_to_close_timeout=timedelta(seconds=5),
        )

        # Step 4: Execute with progressive fallback
        for i, model_cfg in enumerate(model_chain):
            try:
                result = await workflow.execute_activity(
                    execute_with_model,
                    args=[model_cfg, dco_json, ticket_id],
                    retry_policy=RetryPolicy(
                        initial_interval=timedelta(seconds=model_cfg.retry_delay),
                        maximum_attempts=model_cfg.max_retries,
                        non_retryable_error_types=["FatalError"],
                    ),
                    heartbeat_timeout=timedelta(seconds=30),
                    start_to_close_timeout=timedelta(minutes=30),
                )

                # Success path
                await workflow.execute_activity(
                    handle_success,
                    args=[plan_id, role, ticket_id, result],
                    start_to_close_timeout=timedelta(seconds=10),
                )

                # Start next role as child workflow
                if role == "builder":
                    await workflow.execute_child_workflow(
                        PlanExecutionWorkflow.run,
                        args=[plan_id, "reviewer"],
                    )

                return "completed"

            except RateLimitError:
                # Activity already retried; move to next model
                continue
            except FatalError:
                # Activity exhausted retries; move to next model
                continue

        # All models exhausted
        await workflow.execute_activity(
            trip_circuit_breaker_and_requeue,
            args=[plan_id, role],
            start_to_close_timeout=timedelta(seconds=10),
        )
        return "failed"

    # Signal handler for external cancellation
    @workflow.signal
    async def cancel(self):
        self._cancelled = True

    # Query handler for UI status
    @workflow.query
    def status(self) -> dict:
        return {
            "plan_id": self._plan_id,
            "role": self._role,
            "current_step": self._current_step,
        }
```

```python
# activities.py — Temporal Activities (I/O allowed, non-deterministic OK)

@activity.defn
async def execute_with_model(
    model_cfg: dict,
    dco_json: str,
    ticket_id: str,
) -> dict:
    """Execute an AI harness with the given model. Heartbeats on every output line."""
    session_id = f"{model_cfg['role']}-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
    
    # Create session in DB
    await db.create_session(session_id, model_cfg["role"], [dco["plan_id"]])
    
    # Build the command (reuses existing HarnessLauncher)
    cmd, env = build_harness_cmd(model_cfg, dco_json)
    
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    
    output_lines = []
    tokens_used = 0
    
    async for line in proc.stdout:
        output_lines.append(line.decode().rstrip())
        tokens = extract_tokens(line.decode())
        if tokens:
            tokens_used += tokens
        
        # Heartbeat with progress (enables cancel detection, timeout monitoring)
        activity.heartbeat({
            "session_id": session_id,
            "pid": proc.pid,
            "lines": len(output_lines),
            "tokens": tokens_used,
        })
    
    await proc.wait()
    stderr = await proc.stderr.read()
    
    return {
        "exit_code": proc.returncode,
        "output": "\n".join(output_lines),
        "stderr": stderr.decode(),
        "tokens_used": tokens_used,
        "session_id": session_id,
    }
```

### 2.4 Cancel/Kill Flow (Signal-Based)

Instead of `os.kill(pid, SIGKILL)` via the MCP server:

```
UI: Kill button → POST /sessions/:id/kill → MCP server
  → temporal_client.signal_workflow(workflow_id, "cancel")
  → Workflow receives cancel signal
  → Workflow calls activity.heartbeat() → Temporal detects cancellation
  → Activity receives CancelledError
  → Activity runs cleanup (release tickets, close session)
  → Workflow runs compensation logic
```

No more zombie processes. No more "killed but tickets still claimed." Temporal guarantees exactly-once cancellation semantics.

---

## 3. File-by-File Migration Map

### 3.1 Files That Become Temporal Workflows/Activities

| Current File | Becomes | Notes |
|---|---|---|
| `main.py:_dispatch_one()` | `workflows/plan_execution.py` | The ~300-line retry/fallback nest becomes a clean Workflow |
| `main.py:dispatch_single_plan()` | `workflows/single_plan.py` | Thin wrapper that starts the PlanExecutionWorkflow |
| `main.py:run_role()` | `workflows/role_runner.py` | Cron or manual trigger that queries eligible plans and starts Workflows |
| `executor_cloud.py:run_opencode()` | `activities/execute_model.py` | `subprocess.Popen` becomes `asyncio.create_subprocess_exec` with heartbeats |
| `executor_cloud.py:run_codex()` | `activities/execute_model.py` | Same activity, different harness binary |
| `executor_cloud.py:run_ollama()` | `activities/execute_model.py` | Same activity, different harness binary |
| `executor_cloud.py:run_model()` | Removed | Replaced by workflow-level model chain iteration |
| `executor_cloud.py:execute_step()` | Removed | Replaced by Activity-level DCO file handling |
| `executor_cloud.py:_write_session_log()` | `activities/session_logging.py` | File-writing becomes a DB write Activity |
| `executor_cloud.py:_capture_session_cost()` | `activities/cost_tracking.py` | Post-execution cost capture Activity |

### 3.2 Files That Stay (With Minor Changes)

| Current File | Changes Needed | Notes |
|---|---|---|
| `executor_cloud.py` | Extract prompt-building helpers, remove subprocess code | `_build_opencode_prompt()`, `_resolve_harness()`, `_resolve_model_name()` stay |
| `harness_launcher.py` | No changes | Pure command-building, used by Activities |
| `executor_registry.py` | No changes | Pure config resolution, used by Activities |
| `work_request_factory.py` | No changes | Pure DCO construction, used by Activities |
| `work_request.py` | No changes | Pydantic models, no I/O |
| `db_adapter.py` | Split into sync DB operations (Activities) | See §3.3 below |
| `env_config.py` | No changes | Env loading |
| `harness_enums.py` | No changes | Pure enums |

### 3.3 DB Adapter Changes

The `DBAdapter` class currently uses `psycopg2` (synchronous). Temporal Activities
can be sync or async. We have two options:

**Option A (Recommended): Keep psycopg2, use sync Activities**
- Temporal Python SDK supports sync Activities natively
- No DB library migration needed
- Activities run in a thread pool executor

**Option B: Migrate to asyncpg**
- Native async, better for high-concurrency Workers
- Requires rewriting all DB queries
- Worth it if you plan to run many concurrent Workflows

For the initial migration, **Option A** is the right call. The DB operations
are fast (single-digit ms) and won't bottleneck.

### 3.4 Files That Stay (No Changes)

| File | Why |
|---|---|
| `agent_chat.py` | Interactive chat stays as-is. Temporal is overkill for request/response. |
| `test_invoke.py` | Test invoke stays as a direct subprocess. Lightweight and fine. |
| `typescript/conduit-mcp/src/index.ts` | MCP server becomes the Temporal client + API gateway. New endpoints for workflow status queries. See §4. |
| `angular/conduit-ui/src/**` | UI queries MCP server, which now queries Temporal instead of DB directly. |
| All `.agent/` files | Aspirational architecture docs, not live code. |

### 3.5 New Files To Create

```
nexus/
├── python/
│   └── conduit/
│       ├── temporal/                    # NEW: Temporal integration layer
│       │   ├── __init__.py
│       │   ├── client.py               # Temporal client singleton
│       │   ├── worker.py               # Worker process entry point
│       │   ├── workflows/
│       │   │   ├── __init__.py
│       │   │   ├── plan_execution.py    # PlanExecutionWorkflow
│       │   │   ├── role_runner.py       # Role runner (cron trigger)
│       │   │   └── single_plan.py       # Single-plan dispatch
│       │   └── activities/
│       │       ├── __init__.py
│       │       ├── execute_model.py     # Subprocess execution + heartbeats
│       │       ├── db_operations.py     # DB CRUD (claim ticket, insert receipt, etc.)
│       │       ├── work_request.py      # DCO construction + file I/O
│       │       ├── session_logging.py   # Session event recording
│       │       └── cost_tracking.py     # Post-execution cost capture
│       ├── temporal_config.py           # NEW: Temporal connection config
│       └── TEMPORAL_CONVERSION_PLAN.md  # This document
```

---

## 4. MCP Server Changes (API Gateway Layer)

The MCP server becomes a **Temporal client** that translates HTTP requests into
Temporal SDK calls.

### 4.1 New Dependencies

```json
{
  "dependencies": {
    "@temporalio/client": "^1.x",
    "@temporalio/proto": "^1.x"
  }
}
```

### 4.2 New/Modified Endpoints

| Endpoint | Current Behavior | New Behavior |
|---|---|---|
| `GET /sessions` | Query `sessions` table | Query Temporal for workflow executions + DB for historical sessions |
| `POST /sessions/:id/kill` | `process.kill(-pid, SIGKILL)` | `workflowHandle.signal("cancel")` → graceful cancellation |
| `GET /log/:sessionId` | Poll file on disk every 500ms | Stream from Temporal workflow history or query workflow for output |
| `POST /plans/:planId/restart-builder` | Spawn `main.py` subprocess | `client.start(PlanExecutionWorkflow, args=[planId, "builder"])` |
| `GET /state` | `watcher.getState()` | Query Temporal for active workflow count + DB for plan states |

### 4.3 Temporal Client Setup (TypeScript)

```typescript
import { Connection, Client } from "@temporalio/client";

let client: Client;

async function getTemporalClient(): Promise<Client> {
  if (!client) {
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
    });
    client = new Client({ connection, namespace: "conduit" });
  }
  return client;
}
```

---

## 5. New Failure Model (What Temporal Gives Us)

### 5.1 Current Pain Points → Temporal Solutions

| Pain Point | Current Approach | Temporal Solution |
|---|---|---|
| Silent subprocess crashes | stderr merged into stdout, parsed for patterns | Activity throws exception → Temporal captures full stack trace in event history |
| Process monitoring | `ps` scan + PID check + heartbeat timers | Activity heartbeats + Temporal's built-in timeout detection |
| Crash recovery | In-memory state lost, DB recovery from sessions table | Event sourcing: workflow replays from history, resumes at last completed Activity |
| Retry logic | Nested for-loops with manual sleep, error string matching | Declarative RetryPolicy with exponential backoff, non-retryable error types |
| Cancel/Kill | SIGKILL, no cleanup, orphaned tickets | Signal → CancelledError in Activity → compensation logic → guaranteed cleanup |
| Concurrency control | Simple counters in agent_chat.py | Task queue max concurrency, per-queue worker count |
| Observability | File polling, DB queries, SSE from watcher | Temporal Web UI: real-time workflow status, event history, stack traces |
| Partial failure | All-or-nothing: if any model fails, circuit breaker trips | Per-Activity retry, per-model fallback, workflow-level compensation |

### 5.2 Error Classification

Activities throw typed errors that Temporal's RetryPolicy understands:

```python
class RateLimitError(Exception):
    """API rate limit — retry with backoff."""
    pass

class FatalError(Exception):
    """Non-retryable — move to next fallback model."""
    pass

class ModelError(Exception):
    """Model-level failure — retryable."""
    pass

class CircuitBreakerError(Exception):
    """All models exhausted — trip breaker and requeue."""
    pass
```

### 5.3 Circuit Breaker Flow

The circuit breaker moves from a DB row polled by the Python process to a
Temporal-native concept:

1. Workflow exhausts all models → executes `trip_circuit_breaker_and_requeue` Activity
2. Activity inserts REQUEUED receipt + BLOCK receipt into DB
3. A separate "breaker watcher" Workflow starts, sleeping for `retry_after` seconds
4. On expiry, breaker watcher resets the breaker and starts pending workflows
5. UI queries Temporal for breaker state instead of polling DB

---

## 6. Worker Deployment Model

### 6.1 Single Worker (Phase 1)

For initial deployment, one Worker process handles all task queues:

```bash
# Start the Temporal worker
python -m conduit.temporal.worker
```

This single worker polls all task queues (`builder`, `reviewer`, `planner`,
`critic`, `default`) and executes Activities. It's the equivalent of the
current cron-driven `main.py --all` loop, but with Temporal's durability.

### 6.2 Per-Role Workers (Phase 2)

When you're ready to scale, split into per-role workers:

```bash
python -m conduit.temporal.worker --role builder   # Only builder tasks
python -m conduit.temporal.worker --role reviewer  # Only reviewer tasks
python -m conduit.temporal.worker --role planner   # Only planner tasks
```

Each can run on different machines, with different resource allocations.
Temporal handles fair dispatch across workers.

### 6.3 Worker Configuration

```python
# temporal/worker.py
import asyncio
from temporalio.worker import Worker
from temporalio.client import Client
from conduit.temporal.workflows.plan_execution import PlanExecutionWorkflow
from conduit.temporal.activities import execute_model, db_operations

async def main():
    client = await Client.connect("localhost:7233", namespace="conduit")
    
    worker = Worker(
        client,
        task_queue="builder",
        workflows=[PlanExecutionWorkflow],
        activities=[
            execute_model.execute_with_model,
            db_operations.claim_ticket,
            db_operations.insert_receipt,
            db_operations.advance_cursor,
            # ... all activities
        ],
        max_concurrent_activities=4,  # Match current AGENT_CHAT_MAX_GLOBAL
    )
    
    await worker.run()

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 7. Migration Phases

### Phase 0: Setup (1-2 hours)

- [ ] Install Temporal dev server: `temporal server start-dev --db postgresql`
- [ ] Install Python SDK: `pip install temporalio`
- [ ] Install TypeScript SDK: `npm install @temporalio/client`
- [ ] Create `conduit` namespace: `temporal operator namespace create conduit`
- [ ] Verify connectivity: `temporal workflow list --namespace conduit`
- [ ] Create `nexus/legacy/python/conduit/temporal/` directory structure

### Phase 1: Activity Extraction (3-5 hours)

- [ ] Extract `execute_with_model` Activity from `executor_cloud.py`
  - Move subprocess logic to Activity, add heartbeats
  - Keep prompt-building helpers in `executor_cloud.py`
  - Add typed error classes (RateLimitError, FatalError)
  - Test: run Activity standalone, verify output matches current behavior
- [ ] Extract DB operations as Activities
  - `claim_ticket_activity`, `insert_receipt_activity`, `advance_cursor_activity`
  - `create_next_tickets_activity`, `close_session_activity`
  - Wrap `DBAdapter` calls, keep existing DB class unchanged
  - Test: run each Activity standalone against dev DB
- [ ] Extract WorkRequest DCO construction as Activity
  - `build_work_request_dco_activity`
  - Reuses `WorkRequestFactory.create_from_plan()` unchanged
  - Test: verify DCO JSON output matches current format

### Phase 2: Workflow Implementation (4-6 hours)

- [ ] Implement `PlanExecutionWorkflow`
  - Port `_dispatch_one()` logic to Workflow
  - Replace nested for-loops with Activity retry policies
  - Add Signal handler for cancellation
  - Add Query handler for UI status
  - Test: run Workflow with mock Activities, verify state transitions
- [ ] Implement `RoleRunnerWorkflow` (cron replacement)
  - Query eligible plans from DB
  - Start child `PlanExecutionWorkflow` for each
  - Respect circuit breaker state
  - Test: mock eligible plans, verify fan-out
- [ ] Implement `SinglePlanWorkflow`
  - Thin wrapper for UI-initiated builder restarts
  - Bypasses cursor/breaker checks (like current `--plan` flag)
- [ ] Wire Workflows into Worker
  - Register all Workflows and Activities
  - Start Worker, verify it polls task queues

### Phase 3: MCP Server Integration (2-3 hours)

- [ ] Add Temporal client to MCP server
  - Install `@temporalio/client`
  - Create `getTemporalClient()` singleton
- [ ] Update session kill endpoint
  - `POST /sessions/:id/kill` → `workflowHandle.signal("cancel")`
  - Keep SIGKILL fallback for legacy sessions
- [ ] Update builder restart endpoint
  - `POST /plans/:planId/restart-builder` → `client.start(PlanExecutionWorkflow)`
  - Remove subprocess spawn
- [ ] Update log streaming endpoint
  - `GET /log/:sessionId` → stream from Temporal workflow output (or keep file polling for Phase 3)
- [ ] Add workflow status endpoint
  - `GET /workflows` → list active/failed/completed workflows

### Phase 4: Cutover & Cleanup (2-3 hours)

- [ ] Disable cron-driven `main.py --all` loop
- [ ] Start Temporal Worker as systemd service (or `make temporal-worker`)
- [ ] Run both systems in parallel for one cycle, compare results
- [ ] Remove `_dispatch_one()` from `main.py` (keep `print_status()` and CLI tools)
- [ ] Remove `run_role()` cron loop from `main.py`
- [ ] Remove `_cleanup_orphaned_processes()` (Temporal handles this)
- [ ] Remove `_kill_process_tree()` (replaced by Signals)
- [ ] Remove `acquire_lock()` / `release_lock()` (Temporal handles concurrency)
- [ ] Keep `main.py` for CLI tools: `--status`, `--supersede`, `--cancel`, `--clean-test-artifacts`

### Phase 5: Polish (2-3 hours)

- [ ] Add Temporal Web UI link to Angular UI
- [ ] Add workflow status to sessions table (running/completed/failed/cancelled)
- [ ] Add cancel button to workflow detail view
- [ ] Add workflow history viewer (event timeline)
- [ ] Update Makefile: `make temporal-worker`, `make temporal-status`
- [ ] Write acceptance tests for PlanExecutionWorkflow
- [ ] Document the new architecture in ARCHITECTURE.md

---

## 8. Risk Assessment

### 8.1 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Temporal learning curve | High | Medium | Start with Phase 1 (Activities only, no Workflows) to build familiarity |
| Determinism violations in Workflows | Medium | High | Keep Workflows thin (orchestration only), push all I/O to Activities |
| Performance overhead | Low | Medium | Activities are I/O-bound (LLM calls take seconds/minutes); Temporal overhead is negligible |
| DB connection pool exhaustion | Low | Medium | Reuse existing `DBAdapter` with `psycopg2.pool.ThreadedConnectionPool` |
| Temporal server operational burden | Medium | Medium | Start with `temporal server start-dev` (single binary); move to Temporal Cloud for production |
| Two systems to debug (Conduit + Temporal) | Medium | Medium | Keep MCP server as API gateway; add correlation IDs (workflow_id → session_id) |

### 8.2 What Could Go Wrong & Rollback Plan

1. **Workflow determinism failures** → Replay test every Workflow before deploying
2. **Temporal server crash** → Workflows resume from event history on restart (this is the whole point)
3. **Wrong execution order** → Run both old and new systems in parallel for one cycle, diff results
4. **DB connection issues** → Activities throw, Temporal retries with backoff
5. **Rollback**: Stop Temporal Worker, restart cron-driven `main.py --all`. No DB migration needed.

---

## 9. What Gets Deleted

After successful cutover (Phase 4), these can be removed:

- `main.py`: `_dispatch_one()` (~300 lines), `dispatch_single_plan()` (~40 lines), `run_role()` (~60 lines), `_cleanup_orphaned_processes()` (~30 lines), `_kill_process_tree()` (~15 lines), `acquire_lock()` / `release_lock()` (~50 lines), `_is_lock_stale()` (~25 lines), `get_model()` (~20 lines)
- `main.py` CLI args: `--run`, `--plan`, `--force`, `--all`
- `executor_cloud.py`: `run_model()`, `execute_step()`, `run_worker()`, `run_opencode()`, `run_codex()`, `run_ollama()` subprocess logic
- `agent-watcher.ts`: Entire file (replaced by Temporal heartbeats + queries)

**Total deleted: ~550 lines of orchestration code, replaced by ~300 lines of cleaner Workflow + Activity code.**

---

## 10. What Stays (Preserved)

- All DB schema and `DBAdapter` methods
- All WorkRequest types (`work_request.py`, `work_request_factory.py`)
- All harness resolution (`harness_launcher.py`, `executor_registry.py`, `harness_enums.py`)
- All prompt building (`executor_cloud.py:_build_opencode_prompt`, etc.)
- All AI config registry (DB-driven, MCP-managed)
- MCP server as API gateway (all existing endpoints, plus new Temporal ones)
- Angular UI (sessions table, log viewer, analytics — all query the same MCP API)
- Agent chat server (`agent_chat.py` — unchanged)
- Test invoke (`test_invoke.py` — unchanged)
- CLI tools (`main.py --status`, `--supersede`, `--cancel`, `--clean-test-artifacts`)
- Lock, cursor, and circuit breaker **DB schema** (the data stays; the orchestration logic that reads/writes it moves to Activities)

---

## 11. Cost & Timeline Estimate

| Phase | Developer Hours | Calendar Days | Dependencies |
|---|---|---|---|
| 0: Setup | 1-2 | 1 | Temporal dev server installed |
| 1: Activity Extraction | 3-5 | 2-3 | Phase 0 |
| 2: Workflow Implementation | 4-6 | 3-4 | Phase 1 |
| 3: MCP Integration | 2-3 | 1-2 | Phase 2 |
| 4: Cutover & Cleanup | 2-3 | 1-2 | Phase 3 |
| 5: Polish | 2-3 | 1-2 | Phase 4 |
| **Total** | **14-22 hours** | **2-3 weeks** | |

This is conservative. The actual code changes are modest (~300 lines of new Workflow/Activity code, ~50 lines of MCP server changes). The bulk of the time is testing, debugging determinism issues, and ensuring the cutover is clean.

---

## 12. Decision Points

These should be decided before starting Phase 1:

1. **Temporal Server**: Self-hosted (`temporal server start-dev`) or Temporal Cloud? → Start with dev server, cloud later
2. **DB library**: Keep `psycopg2` (sync) or migrate to `asyncpg`? → Keep `psycopg2` for Phase 1
3. **Worker count**: One Worker for all roles, or per-role Workers? → One Worker for Phase 1
4. **Namespace**: Single `conduit` namespace, or per-environment? → Single namespace for Phase 1
5. **Log streaming**: Keep file-based log polling, or stream from Temporal workflow output? → Keep file polling for Phase 1, migrate later

---

*Document version: 1.0 — 2026-06-13*
*For questions or revisions, open a discussion in the Nexus WRP channel.*
