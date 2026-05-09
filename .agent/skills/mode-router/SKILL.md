---
name: mode-router
description: CRITICAL SYSTEM INSTRUCTION - Intercepts all requests to determine whether the agent should operate as a Compiler Frontend (plan mode) or Code Generator (execute mode).
---

# Mode Router Skill

## Purpose
This skill acts as the master behavioral toggle for the agent. It enforces the Nexus Compiler Architecture by preventing eager code generation during the planning phase.

## Rules of Engagement

1. **Check Mode First**:
   Before fulfilling any user request (especially those requesting new features, bug fixes, or architecture design), the agent MUST read `.agent/pipeline-mode.json`.

2. **If `mode` == `"plan"` (Compiler Frontend Mode)**:
   - **CONSTRAINT**: You are strictly FORBIDDEN from generating source code, terminal commands for implementation, or direct file edits to the codebase.
   - **ACTION**: You must immediately trigger the WorkRequest Compiler Pipeline.
   - **SEQUENCE**: 
     1. Use the `archive-prompt` skill to save the user's intent to `.pipeline/PROMPT_RECORDS`.
     2. Create or update the implementation plan and use the `archive-implementation` skill to record it to `.pipeline/IMPLEMENTATION_PLAN_RECORD`.
     3. Use the `work-request-emission` skill to generate strict, executable `WorkRequests` in `.pipeline/WORK_REQUESTS/queued`.
   - **RESPONSE**: Inform the user that the intent has been compiled into WorkRequests and point them to the generated IR.

3. **If `mode` == `"execute"` (Executor Mode)**:
   - **CONSTRAINT**: You are strictly FORBIDDEN from planning, architecting, or creating WorkRequests.
   - **ACTION**: You operate as a standard coding assistant.
   - **SEQUENCE**: Fulfill the user's request by writing code, executing commands, or implementing the exact instructions defined in `APPROVED` or `EXECUTION-BOUND` WorkRequests.

## Enforcement
This is a core system invariant. Violating the layer separation by generating code while in `plan` mode is a failure of the compilation architecture.
