---
name: mode-router
description: CRITICAL SYSTEM INSTRUCTION - Intercepts all requests to determine whether the agent should operate as a Compiler Frontend (plan mode) or Code Generator (execute mode), based on Pipeline Intent.
---

# Mode Router Skill

## Purpose
This skill acts as the master behavioral toggle for the agent. It enforces the Nexus Compiler Architecture by reading the Pipeline Intent Contract and deriving the correct ExecutionState before routing to plan or execute mode.

## Rules of Engagement

### 1. Load and Normalize Intent First
Before fulfilling any user request, the agent MUST:

1. Read `.agent/pipeline-mode.json` for runtime mode override
2. Read `.pipeline/PIPELINE_INTENT.yaml` for the canonical intent contract (if it exists)
3. If `PIPELINE_INTENT.yaml` exists, run the Intent Normalizer:
   - Validate against schema v1
   - Reject invalid combinations (see §3.2 of PIPELINE_INTENT_MODEL.md)
   - Derive ExecutionState

### 2. Route on ExecutionState

#### If ExecutionState == `READ_ONLY_PLAN`:
- **CONSTRAINT**: You are strictly FORBIDDEN from generating source code, terminal commands for implementation, or direct file edits to the codebase.
- **ACTION**: You must immediately trigger the WorkRequest Compiler Pipeline.
- **SEQUENCE**: 
  1. Use the `archive-prompt` skill to save the user's intent to `.pipeline/PROMPT_RECORDS`.
  2. Create or update the implementation plan and use the `archive-implementation` skill to record it to `.pipeline/IMPLEMENTATION_PLAN_RECORD`.
  3. Use the `work-request-emission` skill to generate strict, executable `WorkRequests` in `.pipeline/WORK_REQUESTS/queued`.
- **RESPONSE**: Inform the user that the intent has been compiled into WorkRequests and point them to the generated IR.

#### If ExecutionState == `CODE_EXECUTION`:
- **CONSTRAINT**: You are strictly FORBIDDEN from planning, architecting, or creating WorkRequests.
- **ACTION**: You operate as a standard coding assistant.
- **SEQUENCE**: Fulfill the user's request by writing code, executing commands, or implementing the exact instructions defined in `APPROVED` or `EXECUTION-BOUND` WorkRequests.
- **SCOPE**: `mutationScope.code.write` gates all write operations. If `code.write: false`, you MUST NOT modify source files.

#### If ExecutionState == `RUNTIME_INSTRUMENT`:
- **CONSTRAINT**: Same as CODE_EXECUTION — no planning, no WR creation.
- **ACTION**: Standard coding assistant with runtime-level changes permitted.
- **SCOPE**: `mutationScope.runtime.instrument` gates runtime hook insertion. You MAY modify configuration, add telemetry, and alter runtime behavior.

#### If ExecutionState == `TRANSFORM`:
- **CONSTRAINT**: Same as READ_ONLY_PLAN — no code generation.
- **ACTION**: Operate on WorkRequest lifecycle (promote DRAFT→CANDIDATE→APPROVED, manage supersession).
- **SCOPE**: WR transformation only. No code mutation.

#### If No PIPELINE_INTENT.yaml exists:
Fall back to `.agent/pipeline-mode.json`:
- `"mode": "plan"` → READ_ONLY_PLAN behavior
- `"mode": "execute"` → CODE_EXECUTION behavior

#### If Invalid or Ambiguous Intent:
- **HALT** execution
- **REPORT** the specific validation failure
- **REQUIRE** user to fix `PIPELINE_INTENT.yaml` before proceeding

## Enforcement
This is a core system invariant. Violating the layer separation by generating code while in READ_ONLY_PLAN mode, or by producing WorkRequests in CODE_EXECUTION mode, is a failure of the compilation architecture.
