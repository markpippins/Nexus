# H2 jsonb Compatibility — Check & Fix

**Date:** 2026-06-19

## Finding

`@JdbcTypeCode(SqlTypes.JSON)` with `@Column(columnDefinition = "jsonb")` on `PebTransaction.input`, `PebTransaction.output`, `PebTransaction.stateDelta`, `PebViolation.context`, plus `peb_state.content`, `peb_state.metadata`, and `peb_decisions.summary` from V1 migration — all cause H2 DDL warnings when running `@SpringBootTest` with `ddl-auto=create-drop`.

Without the fix, Hibernate logs ~7 `WARN GenerationTarget encountered exception accepting command : Error executing DDL` for `jsonb` columns. The context still starts because these are non-fatal, but the `jsonb` columns silently don't exist on the H2 schema.

## Fix

In `AdmissionControllerFacadeTest.java`:

```
spring.datasource.url=jdbc:h2:mem:testdb;MODE=PostgreSQL;DB_CLOSE_DELAY=-1
```

`MODE=PostgreSQL` makes H2 2.2.x accept `jsonb` as a native type, eliminating all `jsonb`-related DDL warnings.

## Residual

2 DDL warnings remain — both about `timestamp(6) with time zone not null` syntax on `peb_decisions` and `peb_state` tables. These are unrelated to the JSON column concern and are cosmetic (non-fatal warnings, not errors).
