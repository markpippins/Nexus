# H2 DDL Warnings — Full Cleanup

**Date:** 2026-06-19

## Summary

All H2 DDL warnings in the `@SpringBootTest` context are now eliminated. The fix involved three root causes across three files:

### Root Causes Fixed

| Issue | Entity | Fix |
|---|---|---|
| `timestamp(6) with time zone` — H2 rejects precision syntax | PebState, PebDecision | Added `columnDefinition = "timestamp with time zone"` on `createdAt` / `updatedAt` fields |
| `key` is a reserved keyword in H2 | PebState | Changed `@Column` to `@Column(name = "\"key\"", ...)` so Hibernate emits quoted `"key"` |
| `text[]` — H2 doesn't support PostgreSQL array syntax | PebDecision | Changed `columnDefinition` from `"text[]"` to `"TEXT ARRAY"` |

### Infrastructure

- `AdmissionControllerFacadeTest.java`: Uses `spring.jpa.database-platform=org.hibernate.dialect.H2Dialect` (reverted from PostgreSQLDialect experiment). H2 datasource URL uses `MODE=PostgreSQL` to accept `jsonb` columns.

### Result

- **Build:** `mvn -pl peb-bootstrap -am test` → BUILD SUCCESS
- **DDL warnings:** 0 `GenerationTarget encountered exception` (was 7 originally)
- **Tests:** 2 run, 0 failures, 0 errors
