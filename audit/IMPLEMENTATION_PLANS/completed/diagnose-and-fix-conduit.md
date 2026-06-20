# Diagnose and Fix Conduit Pipeline

**Prompt:** 0089

## Goal
Get the Conduit pipeline operational: builder can pick up plans and execute them through to completion.

## Diagnosis Findings
- conduit-mcp running on :3100, Temporal worker active
- Ollama API responds at :11434 with 14 local models
- AI config has 6 providers, 3 harnesses, 36 models — **but 0 role assignments**
- Builder is idle, circuit breaker is not tripped
- 5 stale plans in PENDING with failed/expired tickets need cleanup

## Root Cause
No role assignments exist, so the builder has no model to use when picking up a plan.

## Actions

1. **Assign a model to the builder role** — use the working Ollama models (e.g. `qwen2.5-coder:latest` via `harn-ollama-sdk`)
2. **Clean up stale plans** — cancel/delete plans 0125-0130 with failed/expired tickets
3. **Verify** — create a test plan and confirm it moves through PENDING → ACTIVE → COMPLETED

## Files Affected
- conduit-mcp database (AI config role_assignments table)

## Acceptance Criteria
- [ ] Builder has at least one model assigned to its role
- [ ] Builder picks up a plan and executes it
- [ ] Plan reaches completed state
