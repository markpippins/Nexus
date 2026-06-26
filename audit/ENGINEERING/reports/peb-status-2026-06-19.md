# PEB — Persistent Engineering Brain — Status Report

**Date:** 2026-06-19
**Author:** Engineer

## Architecture — 10 Modules

| Module | Role |
|---|---|
| **peb-domain** | 6 JPA entities (PebState, PebTransaction, PebDecision, PebTrace, PebViolation, PebCapability) + enums |
| **peb-store** | JPA repositories + Flyway migrations |
| **peb-core** | Governance engine, violation engine, transaction engine, invariant validator |
| **peb-api** | REST controller (AdmissionControllerFacade) + typed @ExceptionHandler → 422 mapping |
| **peb-hash** | SHA-256 checksum service for peb.state content |
| **peb-adapters** | External integration adapters |
| **peb-observability** | Metrics/monitoring |
| **peb-bootstrap** | Spring Boot application entry point (PebApplication) |
| **peb-test** | Integration/contract test utilities |

## Schema — 3 Flyway Migrations

| Migration | What it does |
|---|---|
| **V1** | Creates 6 PEB tables in `public` schema with `peb_` prefix |
| **V2** | Adds UNIQUE constraint on `peb_violations.transaction_id` |
| **V3** | Creates `peb` schema, moves tables, strips `peb_` prefix |

All entities use `@Table(schema = "peb", name = "...")`.

## Database — 2 Instances

| Database | Purpose | Connection |
|---|---|---|
| **nexus** (pgvector container) | Production data (MCP smoke tests) | `pguser/pgpass` |
| **peb_test** (pgvector container) | Unit test isolation | `peb_test_user/peb_test_pass` |

## Tests — 8 Total

| Test | Count | What it covers |
|---|---|---|
| **ViolationBridgeShapeTest** | 6 | MCP→kernel enum mapping contract |
| **AdmissionControllerFacadeTest** | 2 | 422 @ExceptionHandler + happy path 200 |

## Build

`mvn clean install` → BUILD SUCCESS (~75s), 8/8 tests pass.

## Runtime Verification

MCP smoke test (TS→Java end-to-end) passes:
- MUTATE → `"Mutation processed"`
- Valid violation → `"Violation recorded as REJECTED"`
- Malformed → 422 JSON with structured error body
- DB integrity — 2 audit rows + 1 violation row; atomic rollback

## Known Gaps

1. V3 hasn't been applied to `nexus` database yet (next MCP smoke will apply it)
2. Testcontainers blocked by Docker API version mismatch (1.32 vs 1.40+)
3. No dedicated test user in `nexus` database
