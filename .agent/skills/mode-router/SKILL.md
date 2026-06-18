>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
---
name: mode-router
description: CRITICAL SYSTEM INSTRUCTION — Routes agent execution mode based on canonical ExecutionState from normalize-intent. Pure router — does not interpret raw pipeline intent.
---

# Mode Router Skill v1.1

## Purpose

Pure routing function over a canonical ExecutionState. Consumes pre-validated ExecutionState from normalize-intent and deterministically selects the execution pipeline entry point.

## Position in System Architecture

```
normalize-intent (EXCLUSIVE OWNER — control plane)
        ↓
ExecutionState (CANONICAL, pre-validated)
        ↓
mode-router (PURE ROUTER — no YAML, no validation, no derivation)
        ↓
Execution pipeline
```

## Rules of Engagement

### 1. Initialize — Acquire ExecutionState

Before any routing decision, the agent MUST call normalize-intent to obtain the canonical ExecutionState:

```
executionState = normalize-intent()
```

Precondition:
```
assert(executionState != null)
assert(executionState != INVALID_STATE)
```

If normalize-intent returns INVALID_STATE:
- HALT execution immediately
- REPORT the specific validation failure from normalize-intent's validationReport
- REQUIRE user to fix input before proceeding

### 2. Route on ExecutionState

Pure mapping function — no branching logic beyond the switch:

```
function route(state: ExecutionState): ExecutionMode {
  switch (state) {
    case "READ_ONLY_PLAN":
      return "PLAN_PIPELINE";

    case "CODE_EXECUTION":
      return "EXECUTION_PIPELINE";

    case "RUNTIME_INSTRUMENT":
      return "OBSERVATION_PIPELINE";

    case "TRANSFORM_PIPELINE":
      return "TRANSFORM_PIPELINE";

    case "INVALID_STATE":
    default:
      return "INVALID_ROUTE";
  }
}
```

#### PLAN_PIPELINE (from READ_ONLY_PLAN)

- **CONSTRAINT**: Strictly FORBIDDEN from generating source code, terminal commands for implementation, or direct file edits to the codebase.
- **ACTION**: Trigger the WorkRequest Compiler Pipeline.
- **SEQUENCE**: 
  1. Use `save_prompt` to save the user's intent to the audit catalog.
  2. Use `create_proposed_plan` or `create_plan` via the MCP server (http://localhost:3100/tools/call) to create the plan. The MCP server handles file creation, numbering, and receipt issuance automatically.
  3. Use `update_plan` to write elucidation metadata (filesAffected, acceptanceCriteria, dependencies).
  4. Use `issue_receipt` with type `PLAN_CREATE` to finalize the plan into pending.
- **RESPONSE**: Inform the user the intent has been compiled into a plan and is ready for implementation.

#### EXECUTION_PIPELINE (from CODE_EXECUTION)

- **CONSTRAINT**: Strictly FORBIDDEN from planning, architecting, or creating WorkRequests.
- **ACTION**: Operate as a standard coding assistant.
- **SEQUENCE**: Fulfill the user's request by writing code, executing commands, or implementing the exact instructions defined in `APPROVED` or `EXECUTION-BOUND` WorkRequests.
- **SCOPE**: `mutationScope.code.write` gates all write operations.

#### OBSERVATION_PIPELINE (from RUNTIME_INSTRUMENT)

- **CONSTRAINT**: Same as EXECUTION_PIPELINE — no planning, no WR creation.
- **ACTION**: Standard coding assistant with runtime-level changes permitted.
- **SCOPE**: `mutationScope.runtime.instrument` gates runtime hook insertion. May modify configuration, add telemetry, alter runtime behavior.

#### TRANSFORM_PIPELINE (from TRANSFORM_PIPELINE)

- **CONSTRAINT**: Same as PLAN_PIPELINE — no code generation.
- **ACTION**: Operate on WorkRequest lifecycle (promote DRAFT→CANDIDATE→APPROVED, manage supersession).
- **SCOPE**: WR transformation only. No code mutation.

#### INVALID_ROUTE (from INVALID_STATE or unmapped state)

- **ACTION**: HALT execution.
- **REPORT**: "Cannot route — invalid or missing ExecutionState. Run normalize-intent to diagnose."
- **REQUIRE**: User to fix configuration before proceeding.

## Failure Model

### F1 — MISSING_EXECUTION_STATE

Triggered when normalize-intent was skipped or returned null.

```json
{
  "code": "MISSING_EXECUTION_STATE",
  "severity": "CRITICAL",
  "message": "mode-router requires ExecutionState from normalize-intent"
}
```

Response: HALT, report, require normalize-intent to run first.

### F2 — INVALID_ROUTE

Triggered when ExecutionState is INVALID_STATE or an unmapped state appears.

```json
{
  "code": "INVALID_ROUTE",
  "severity": "CRITICAL",
  "message": "Cannot route from ExecutionState: INVALID_STATE"
}
```

Response: HALT, report, require user to fix pipeline configuration.

## Enforcement

This is a core system invariant. Violating the layer separation by:
- routing without a valid ExecutionState
- interpreting raw intent directly within the router
- deriving ExecutionState locally instead of calling normalize-intent

...is a failure of the compilation architecture.

## Invariants

| # | Invariant |
|---|---|
| I1 | mode-router MUST NOT interpret raw pipeline intent |
| I2 | ExecutionState MUST originate exclusively from normalize-intent |
| I3 | ExecutionState → ExecutionMode mapping is total and deterministic |
| I4 | There must never exist two systems deriving ExecutionState |
