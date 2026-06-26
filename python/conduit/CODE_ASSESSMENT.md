# Conduit Code Assessment

Date: 2026-06-09 (updated 2026-06-10)

## Scope

This assessment covers the Python orchestration service in `nexus/legacy/python/conduit/`.
The review focused on:

- plan/ticket/receipt lifecycle handling
- executor dispatch and timeout behavior
- WorkRequest DCO generation
- chat agent process handling
- local test coverage and advertised verification commands

## Executive Summary

`conduit` has a clear operational direction: ticket claims authorize
work, WorkRequests capture execution intent, and receipts provide the audit
trail. The implementation is compact and mostly readable, and the available
tests pass.

The main risk is lifecycle authority drift. The manager currently emits some
receipts that do not match the role that performed the work, which can mark a
plan completed before independent review occurs. That undermines the
receipt-first model the rest of the system is trying to enforce.

## Confirmed Strengths

- The CLI has explicit role dispatch paths and a status mode in `main.py`.
- Work execution is guarded by ticket claiming before subprocess launch.
- Executor subprocesses are launched in a new session and killed as a process
  group on manager-level timeout.
- Rate-limit retry loop keeps tickets claimed, avoiding circuit-breaker trips
  and conduit pauses (v090).
- Work-time tracking (`total_work_seconds`) ensures watchdog only counts actual
  execution time, not retry waits (v090).
- WorkRequest generation captures plan goal, content, acceptance criteria,
  target files, lineage, role, harness, model, and session metadata.
- The harness launcher moves command construction away from role-specific
  hardcoded flag branches.

## Findings (Historical)

### 1. Successful builder runs issue `REVIEW_PASS`

Severity: High

`main.py` maps builder success to `IMPLEMENTATION`, but then also inserts a
`REVIEW_PASS` receipt for both builder and reviewer roles:

- `main.py:222-227` defines builder success as `IMPLEMENTATION`.
- `main.py:320-335` inserts the role-specific success receipt.
- `main.py:336-352` inserts `REVIEW_PASS` when `role in ("builder", "reviewer")`.

Impact:

- A successful builder execution can make `plan_status` classify the plan as
  completed before reviewer validation.
- `DBAdapter.create_next_tickets()` treats any `REVIEW_PASS` as terminal and
  skips child-ticket creation, so reviewer tickets can be suppressed.
- This directly conflicts with the documented lifecycle:
  `PLAN_CREATE -> IMPLEMENTATION -> REVIEW_PASS`.

Recommendation:

- Only the reviewer success path should emit `REVIEW_PASS`.
- Builder success should emit `IMPLEMENTATION` and create a reviewer ticket.
- Add an integration test that dispatches a builder against a fake executor and
  asserts the resulting receipts are exactly `IMPLEMENTATION` plus an open
  reviewer ticket.

### 2. Reviewer success emits both `REVIEW` and `REVIEW_PASS`

Severity: Medium

`_SUCCESS_RECEIPTS` maps reviewer success to `REVIEW`, and the follow-on block
then emits `REVIEW_PASS`:

- `main.py:222-227`
- `main.py:320-352`

Impact:

- The receipt chain contains a "review started/worked" receipt only after the
  reviewer has already completed.
- If `REVIEW` means "review in progress" in the MCP state machine, this creates
  misleading audit history.

Recommendation:

- Decide whether `REVIEW` is a start receipt or a completed-review evidence
  receipt.
- If it is a start receipt, issue it before reviewer execution, not after.
- If reviewer success means pass/fail only, remove `REVIEW` from the success
  mapping and use only `REVIEW_PASS` or `REVIEW_REJECT`.

### 3. Schema ownership is duplicated between Python and TypeScript

Severity: Medium

`DBAdapter._init_db()` creates and migrates tables also owned by
`conduit-mcp/src/db.ts`, including `tickets`, receipt columns, circuit breaker
state, sessions, and work requests:

- `db_adapter.py:20-65` creates `work_requests`, `pipeline_cursor`, and
  `tickets`.
- `db_adapter.py:114-151` mutates `receipts` and ticket columns.

Impact:

- Two runtimes can drift on schema shape, constraints, and migration order.
- The Python adapter assumes MCP-owned tables such as `plans`, `receipts`,
  `sessions`, and `circuit_breaker` already exist, but also mutates them.
- Failures may appear only on fresh databases or partially migrated databases.

Recommendation:

- Make `conduit-mcp` the schema owner and have the manager fail fast with a
  clear "run MCP migration/init first" error if required tables or columns are
  missing.
- Alternatively, move schema definitions into one shared migration source and
  generate both runtime adapters from it.

### 4. Path containment check is fragile

Severity: Medium

`executor_cloud.py` checks resource paths with:

- `executor_cloud.py:461-463`

The current check compares `commonpath(...).startswith(working_path)`. This is
less precise than checking equality against the normalized working directory.

Impact:

- Prefix-based checks are easy to get wrong when paths share prefixes.
- `working_path` is not normalized in the comparison expression itself.

Recommendation:

- Normalize once and require `os.path.commonpath([candidate, root]) == root`.
- Apply the same pattern anywhere model output or DCO-provided paths are read or
  written.

### 5. Chat API has no authentication or concurrency limit

Severity: Medium

`agent_chat.py` accepts arbitrary local HTTP `POST /chat` requests, starts a
background thread, and launches a harness subprocess:

- `agent_chat.py:309-348`

Impact:

- Any process that can reach the chat server can launch planner, builder,
  reviewer, or critic agents.
- There is no per-role lock, queue limit, or single-writer guard in this chat
  path.

Recommendation:

- Restrict the server bind address where possible.
- Add a shared token or local-only trust boundary check if exposed through a
  proxy.
- Enforce a single running builder session and a small global session limit.

### 6. Coverage does not exercise the critical lifecycle path

Severity: Medium

The existing Python tests pass, but the current coverage is concentrated on
ticket-spawn guard behavior and harness launcher behavior. The high-risk path
in `_dispatch_one()` is not covered.

Recommendation:

- Add tests for:
  - builder success receipt sequence
  - reviewer pass/reject receipt sequence
  - API limit handling
  - timeout handling and ticket closure
  - failed executor ticket and receipt state

## Verification Run

Commands run from `/home/codex/dev`:

```bash
cd nexus/legacy/python/conduit && python3 -m pytest -q
```

Result:

- 29 passed
- 34 warnings
- Warnings are `datetime.utcnow()` deprecation warnings on Python 3.13+

## Post-Assessment Updates (2026-06-10)

### Resolved / Addressed

1. **Rate-limit handling (v090):** Circuit breaker/pause removed from API_LIMIT path.
   Retry loop (5×300s) keeps ticket claimed. `_detect_api_limit_error()` no longer
   gated on `exit_code == 3` — catches `FreeUsageLimitError` stream errors.

2. **Work-time staleness (v090):** Watchdog now checks `total_work_seconds`
   (cumulative subprocess execution), not wall-clock `last_activity`. Waiting time
   during retry sleeps does not count toward staleness.

3. **Retry ticket creation:** `builder failed → (nothing)` mapping unchanged —
   builder failures produce BLOCK, which is terminal. Planner failure now creates
   `planner failed → planner` retry tickets.

4. **Schema authority:** Python conduit now validates required columns on startup
   and fails fast with a clear message if MCP server hasn't run migrations.

### Still Outstanding

1. Builder success path now emits `IMPLEMENTATION` (fixed from earlier `REVIEW_PASS`
   issue) — this is by design, but review semantics remain the same as assessed.
2. No integration test for `_dispatch_one()` retry loop yet.
3. Chat server (`agent_chat.py`) still has no authentication or concurrency limit.
