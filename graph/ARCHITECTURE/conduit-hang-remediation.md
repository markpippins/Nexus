# Conduit Hang Cycle Remediation

**Status:** Proposed | **Area:** Conduit / Temporal / Model Config | **Date:** 2026-06-18

## Problem Summary

When adding a secondary model via the conduit-ui AI Config dialog, the pipeline enters a hang cycle: workflows fail, circuit breaker trips, scheduler idles, breaker resets, workflows fail again. The user perceives a stalled pipeline with no clear feedback.

## Root Causes

### RC1: Empty Model Chain Triggers Infinite Requeue Loop

If `resolve_model_chain_activity()` returns an empty chain (primary config missing or fallback models silently skipped), the workflow exits with "failed". `trip_and_requeue_activity` creates a new Ticket, the scheduler picks it up, and the cycle repeats forever.

**Mechanism:**
- `get_role_model_config()` returns `None` when `role_config` has no matching row or harness binary is empty
- `get_fallback_models()` entries are silently dropped when `invocation_semantics.binary` is empty (line 111 of `work_request.py`)
- Empty chain → `if not model_chain:` → return "failed" → trip + requeue → loop

### RC2: Silent Fallback Model Drop

`resolve_model_chain_activity()` at `work_request.py:109-111` skips fallback entries where `harness_binary` is falsy. This happens when:
- A harness was created without a `binary` field in `invocation_semantics`
- The harness DDL default is `'{}'` — an empty JSON object
- User adds a fallback model with such a harness → it's silently removed from the chain
- No warning logged, no user feedback

### RC3: Global Circuit Breaker Blocks All Dispatch

The scheduler checks `is_circuit_breaker_tripped()` at the top of `_dispatch_cycle()` and skips the ENTIRE cycle if tripped. A single model failure blocks all roles (planner, builder, reviewer, critic) from dispatching any plan.

### RC4: Temporal Client Connection Without Timeout

`Connection.connect()` in `temporal-client.ts:26` has no explicit timeout. Default gRPC timeout is ~120 seconds. Operations that require Temporal (test invoke, workflow status) block the MCP server response for up to 2 minutes.

### RC5: Workflow start_to_close_timeout mirrors subprocess timeout

`execute_with_model` activity has `start_to_close_timeout=timedelta(minutes=30)` matching `EXECUTOR_TIMEOUT=1800`. A hung subprocess blocks the workflow for 30 minutes before fallback kicks in.

### RC6: Scheduler trips breaker but breaker has no per-role granularity

The `circuit_breaker` table (line 353 in `db.ts`) is a single-row singleton. There is no per-role or per-model breaker state. A planner failure blocks builder dispatch.

## Fixes

### F1: Prevent Empty-Chain Requeue Loop

**File:** `nexus/python/conduit/temporal/workflows/plan_execution.py`

When `model_chain` is empty or `resolve_model_chain_activity` returns `[]`:
- Do NOT trip circuit breaker or requeue
- Create a BLOCK receipt with message: "No model configuration found for role {role} — configure a model in AI Settings"
- Close the ticket as "failed" with `closure_reason = 'no_model_config'`
- Do NOT spawn next tickets

```python
# After line 134 in plan_execution.py
if not model_chain:
    await workflow.execute_activity(
        "insert_receipt_activity",
        args=[plan_id, "BLOCK", role, session_id, ticket_id,
              f"No model configuration found for role={role}. "
              f"Configure a model in AI Settings.",
              {"error": "no_model_config", "role": role},
              0],
        start_to_close_timeout=timedelta(seconds=10),
    )
    await workflow.execute_activity(
        "close_ticket_activity",
        args=[plan_id, role, session_id, "failed"],
        start_to_close_timeout=timedelta(seconds=10),
    )
    return "failed"
```

### F2: Log and Validate Fallback Model Binary

**File:** `nexus/python/conduit/temporal/activities/work_request.py`

When a fallback entry is skipped due to missing binary, log a warning and include the harness/harness_id for debugging:

```python
# After line 110 in work_request.py
if not harness_binary:
    activity.logger.warning(
        f"resolve_model_chain: skipping fallback for role={role} "
        f"model={model_id} — harness '{fb.get('harness_name', '?')}' "
        f"(id={fb.get('harness_id', '?')}) has no 'binary' in invocation_semantics"
    )
    continue
```

Also add validation to the MCP handler for `POST /config/ai/role` to reject or warn when a selected model's harness has empty `invocation_semantics.binary`.

### F3: Per-Role-Model Circuit Breaker (or at least non-blocking scheduler)

**File:** `nexus/python/conduit/temporal/scheduler.py`

Replace the global circuit breaker skip with per-role checking. Instead of skipping the entire cycle, only skip roles whose model chain is known to be tripped:

```python
# Replace lines 167-170
for role in self._roles:
    if self._db.is_role_circuit_breaker_tripped(role):
        _log.info("Cycle %d — circuit breaker tripped for role=%s, skipping", self._cycle_count, role)
        continue
    dispatched = await self._dispatch_role(role)
    total_this_cycle += dispatched
```

**File:** `nexus/typescript/conduit-mcp/src/db.ts` and `nexus/python/conduit/db_adapter.py`

Add per-role-model breaker table:

```sql
CREATE TABLE IF NOT EXISTS role_circuit_breaker (
    role       TEXT NOT NULL,
    model_id   TEXT NOT NULL,
    tripped    INTEGER DEFAULT 0,
    tripped_at TEXT,
    retry_after INTEGER DEFAULT 1800,
    error      TEXT,
    failure_count INTEGER DEFAULT 0,
    PRIMARY KEY (role, model_id)
);
```

### F4: Add Connection Timeout to Temporal Client

**File:** `nexus/typescript/conduit-mcp/src/temporal-client.ts`

```typescript
_connection = await Connection.connect({
    address: TEMPORAL_ADDRESS,
    // Default gRPC timeout is ~120s — set explicit 5s
    connectTimeout: 5000,
});
```

### F5: Shorter Activity Timeout with Subprocess-Level Timeout

**File:** `nexus/python/conduit/temporal/workflows/plan_execution.py`

Set a more aggressive `start_to_close_timeout` on `execute_with_model` that allows the subprocess-level timeout to be the primary timeout:

```python
# Currently: start_to_close_timeout=timedelta(minutes=30)
# Change to:
heartbeat_timeout=timedelta(seconds=30),  # alert on stall within 30s
start_to_close_timeout=timedelta(minutes=35),  # outer bound
```

The `_timer_and_heartbeat()` coroutine already enforces the 1800s `EXECUTOR_TIMEOUT` — the activity timeout should be slightly above that as a safety net, not the primary timeout.

### F6: Clear User Feedback on Empty Chain / Missing Config

**File:** `nexus/angular/conduit-ui/`

Add a toast notification when `saveAllRoles()` saves but the resulting config has models with harnesses that lack binary semantics:

- After `saveRolesBatch` completes, call a new endpoint `POST /config/ai/validate` that checks:
  - Each role has at least one model
  - Each model's harness has a non-empty `binary` in `invocation_semantics`
  - References to providers/harnesses resolve
- Show validation warnings in the UI with actionable messages

### F7: Scheduler Idle-Backoff Cap

**File:** `nexus/python/conduit/temporal/scheduler.py`

When idle, the scheduler backs off to `SCHEDULER_IDLE_BACKOFF` (default 60s). If all cycles keep failing, the backoff should not prevent prompt re-dispatch when config changes. Add a mechanism to reset to the active interval when new tickets are created or config changes:

```python
# In scheduler, expose a wake() method
async def wake(self):
    self._next_sleep = self._interval
    self._wake_event.set()
```

Call `wake()` from the MCP server when `/config/ai/role` is updated, so the scheduler immediately re-evaluates.

## Implementation Priority

| Fix | Impact | Effort | Priority |
|-----|--------|--------|----------|
| F1: Empty chain guard | Prevents infinite requeue | 1 file, ~15 lines | P0 |
| F2: Log dropped fallbacks | Diagnosability | 1 file, ~5 lines | P0 |
| F3: Per-role breaker | Unblocks pipeline | 3 files, ~80 lines | P1 |
| F4: Connection timeout | Prevents MCP hangs | 1 file, 1 line | P1 |
| F5: Activity timeout | Faster failover | 1 file, 2 lines | P2 |
| F6: Validation endpoint | User feedback | 2 files, ~60 lines | P2 |
| F7: Scheduler wake | Immediate re-dispatch | 2 files, ~20 lines | P2 |

## Verification

1. **Unit**: `resolve_model_chain_activity` returns empty chain → workflow creates BLOCK receipt, does not requeue
2. **Unit**: Fallback model with empty harness binary → warning logged, model skipped
3. **Integration**: Dead Temporal server → MCP returns error in <5s instead of hanging 120s
4. **Integration**: Add secondary model with broken harness → toast shows validation warning
5. **E2E**: Circuit breaker trips for builder role → scheduler still dispatches planner/reviewer/critic
