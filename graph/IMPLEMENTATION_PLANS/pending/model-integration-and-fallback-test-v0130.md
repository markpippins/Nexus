# Model integration and fallback test

**Project:** nexus
**Plan Number:** 0130
**Status:** pending

## Goal

Basic end-to-end test that verifies the conduit pipeline can dispatch a work request to a model, and fall back to the secondary model when the primary fails — testing F1-F7 remediation is active and no hang cycle occurs.

## Files Affected

- nexus/python/conduit/temporal/workflows/plan_execution.py
- nexus/python/conduit/temporal/activities/work_request.py
- nexus/python/conduit/temporal/scheduler.py
- nexus/python/conduit/db_adapter.py
- nexus/typescript/conduit-mcp/src/temporal-client.ts

## Acceptance Criteria

### 1. Builder picks up the plan and attempts model invocation with primary model
### 2. On primary model failure, builder falls back to the secondary model in the chain
### 3. System produces output without infinite requeue or hang cycle
### 4. BLOCK receipt is issued if all models in chain are exhausted, not stuck in requeue loop
### 5. Plan completes (terminal state) within reasonable time — not stuck for hours

## Dependencies

- none
