# Add server-side complex operation endpoints in nebula-srv

**Project:** nexus-ui/nexus-rms
**Plan Number:** 0096
**Status:** pending

## Goal

Implement transactional endpoints in nebula-srv for complex multi-row operations: POST /api/features/move (re-parent a feature to a different subsystem), POST /api/subsystems/move (re-parent a subsystem to a different system), POST /api/systems/demote/:id (demote a system to a subsystem of another system). Each runs in a transaction to atomically update all affected rows. The DataService then calls these instead of the current client-side find-and-remove-then-add logic.

## Files Affected

- MODIFY: `typescript/nebula-srv/src/routes.ts` — add three transactional endpoints within `createRoutes()`:
  - `POST /api/features/move` (feature re-parent)
  - `POST /api/subsystems/move` (subsystem re-parent)
  - `POST /api/systems/demote/:id` (system demotion)
- MODIFY: `typescript/nebula-srv/e2e-tests.sh` — add tests 13–15 covering the three complex operation endpoints

## Acceptance Criteria

- [ ] `POST /api/features/move` accepts `{ featureId, targetSystemId, targetSubsystemId }`, updates the feature's `subsystem_id`, and cascades the change to all linked requirements — all in one DB transaction
- [ ] `POST /api/subsystems/move` accepts `{ subsystemId, targetSystemId }`, updates the subsystem's `system_id`, and cascades the change to all linked requirements — all in one DB transaction
- [ ] `POST /api/systems/demote/:id` accepts `{ targetSystemId }`, creates a new subsystem from the source system, moves the source's subsystems to features of the new subsystem, relinks all requirements, then deletes the source system — all in one DB transaction
- [ ] Each endpoint returns an atomic `{ ok: true }` (or `{ ok: true, newSubsystemId }` for demote) on success, and `{ error: message }` with appropriate HTTP status on failure
- [ ] Each endpoint rolls back the transaction on any error (404 not-found or 500 server error)
- [ ] E2E tests pass (tests 13–15 in `e2e-tests.sh`)
- [ ] TypeScript compiles without errors (`tsc --noEmit`)

## Dependencies

- `typescript/nebula-srv/src/routes.ts` — the `createRoutes()` function must already exist with Express Router, pg Pool, and helper functions (`toEpochMs`, `getUnusedColor`)
- PostgreSQL schema must include `systems`, `subsystems`, `features`, and `requirements` tables with FK relationships
