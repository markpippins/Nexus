# @Sql-based Alternative to MODE=PostgreSQL

**Date:** 2026-06-19

## Changes

Replaced `MODE=PostgreSQL` in the H2 datasource URL with a `@Sql`-based init script approach.

### New file

`peb-bootstrap/src/test/resources/init-test-schema.sql`:
```sql
CREATE DOMAIN IF NOT EXISTS jsonb AS JSON;
```

Registers a `jsonb` domain alias on H2 before Hibernate generates DDL, so `columnDefinition = "jsonb"` in entity annotations works without PostgreSQL compatibility mode.

### Modified file

`AdmissionControllerFacadeTest.java`:
- Removed `MODE=PostgreSQL` from `spring.datasource.url`
- Added `@Sql(scripts = "/init-test-schema.sql", executionPhase = BEFORE_TEST_CLASS)` annotation
- Added `spring.sql.init.mode=always` and `spring.sql.init.schema-locations=classpath:init-test-schema.sql` to `@TestPropertySource`

### Mechanism

`spring.sql.init` runs during Spring Boot context initialization (before JPA auto-configuration) because `spring.jpa.defer-datasource-initialization` defaults to `false`. This means the `jsonb` domain exists before Hibernate's `hbm2ddl` DDL generation. The `@Sql` annotation is a secondary documentation marker that runs idempotently.

### Build

`mvn -pl peb-bootstrap -am test` → BUILD SUCCESS, 0 DDL warnings, 2 tests pass.
