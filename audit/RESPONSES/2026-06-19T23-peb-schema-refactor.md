# Schema Refactoring: public.peb_* → peb.*

**Date:** 2026-06-19

## Motivation

PEB tables were in the `public` schema with `peb_` prefixes. Moving them to a dedicated `peb` schema allows dropping the prefix since the schema itself provides the namespace.

## Changes

### Flyway V3 Migration (NEW)

`peb-store/src/main/resources/db/migration/V3__peb_schema.sql`:

```sql
CREATE SCHEMA IF NOT EXISTS peb;

ALTER TABLE peb_state       SET SCHEMA peb;  -- preserves FKs, indexes, constraints
ALTER TABLE peb_transactions SET SCHEMA peb;
ALTER TABLE peb_decisions    SET SCHEMA peb;
ALTER TABLE peb_traces       SET SCHEMA peb;
ALTER TABLE peb_violations   SET SCHEMA peb;
ALTER TABLE peb_capabilities SET SCHEMA peb;

ALTER TABLE peb.peb_state        RENAME TO state;
ALTER TABLE peb.peb_transactions RENAME TO transactions;
ALTER TABLE peb.peb_decisions    RENAME TO decisions;
ALTER TABLE peb.peb_traces       RENAME TO traces;
ALTER TABLE peb.peb_violations   RENAME TO violations;
ALTER TABLE peb.peb_capabilities RENAME TO capabilities;
```

### Entity @Table Annotations (6 files)

| Entity | Before | After |
|---|---|---|
| PebState | `@Table(name = "peb_state")` | `@Table(schema = "peb", name = "state")` |
| PebTransaction | `@Table(name = "peb_transactions")` | `@Table(schema = "peb", name = "transactions")` |
| PebDecision | `@Table(name = "peb_decisions")` | `@Table(schema = "peb", name = "decisions")` |
| PebTrace | `@Table(name = "peb_traces")` | `@Table(schema = "peb", name = "traces")` |
| PebViolation | `@Table(name = "peb_violations")` | `@Table(schema = "peb", name = "violations")` |
| PebCapability | `@Table(name = "peb_capabilities")` | `@Table(schema = "peb", name = "capabilities")` |

### Infrastructure

- Pre-created `peb` schema in `peb_test` database with `AUTHORIZATION peb_test_user`
- Granted `peb_test_user` full permissions on `peb` schema and database-level `CONNECT, CREATE`

## Build

`mvn -pl peb-bootstrap -am test` → BUILD SUCCESS, 8 tests (6 ViolationBridgeShape + 2 AdmissionControllerFacade), 0 failures.
