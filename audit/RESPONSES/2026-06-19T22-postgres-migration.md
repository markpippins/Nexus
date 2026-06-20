# AdmissionControllerFacadeTest — H2 → PostgreSQL Migration

**Date:** 2026-06-19

## Summary

Migrated `AdmissionControllerFacadeTest` from H2 to real PostgreSQL (pgvector container). Clean slate: no H2, no Testcontainers, no type aliases, no `@Sql` scripts.

## Attempts

| Approach | Outcome | Reason |
|---|---|---|
| H2 + MODE=PostgreSQL | DDL warnings | Worked but not real Postgres |
| H2 + @Sql domain alias | Clean DDL | Still H2 |
| Testcontainers PostgreSQL | Can't start | Docker API 1.32 vs required 1.40+ |
| **Direct pgvector connection** | **BUILD SUCCESS** | Real Postgres, Flyway, validate |

## Final Configuration

- **Connection:** `jdbc:postgresql://localhost:5432/nexus` with `pguser/pgpass`
- **Schema:** Flyway (V1+V2 migrations, already-applied ones skipped via `flyway_schema_history`)
- **Validation:** `ddl-auto: validate` (from application.yml)
- **Engine:** Mocked (`@MockitoBean PebGovernanceEngine`) — test never writes to DB

## Files Changed

- `peb-bootstrap/pom.xml` — removed H2, spring-boot-testcontainers, testcontainers-postgresql, testcontainers-junit-jupiter
- `AdmissionControllerFacadeTest.java` — direct PostgreSQL connection, no Testcontainers/H2/Sql annotations
- `PebState.java` — reverted `"key"` quoting (not needed on Postgres)
- `PebDecision.java` — reverted `TEXT ARRAY` to `text[]` (matching Flyway V1)
- Deleted `init-test-schema.sql`

## Build

`mvn -pl peb-bootstrap -am test` → BUILD SUCCESS, 8 tests (6 + 2), 0 failures.
