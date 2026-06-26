# Contributing to PEB Kernel

## Architecture Overview

PEB (Persistent Engineering Brain) is a Spring Boot 3.4 backend implementing a deterministic, event-sourced governance and state management system for the Nexus ecosystem.

### Module Layout

```
peb-kernel/
├── peb-domain/          JPA entities + enums (no framework deps beyond JPA)
├── peb-store/           Spring Data JPA repositories + Flyway migrations
├── peb-core/            Governance engine, transaction engine, violation engine
├── peb-api/             REST controllers (AdmissionControllerFacade)
├── peb-hash/            SHA-256 checksum service for Merkle state chain
├── peb-adapters/        External integration adapters
├── peb-observability/   Metrics / monitoring
├── peb-bootstrap/       @SpringBootApplication + application.yml
└── peb-test/            Test utilities
```

### Key Data Flow

```
MCP Facade (TS) → HTTP POST /api/v1/peb/transaction
  → AdmissionControllerFacade
    → PebGovernanceEngine.processForPath()
      → InvariantValidator (skip for REPORT_VIOLATION)
      → PebTransactionEngine.beginTransaction()
      → PebTransactionEngine.commitTransaction()
      → PebViolationEngine.ingest() [only for REPORT_VIOLATION]
```

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Java | 25+ | Runtime; Byte Buddy experimental flag needed for Mockito |
| Maven | 3.9+ | Build tool |
| Docker | 29+ | For pgvector PostgreSQL container |
| PostgreSQL | 17 | Via pgvector/pgvector:pg17 container |

### Java Note

This environment runs Java 25. Spring Boot's bundled Byte Buddy version (used by `@MockitoBean`) doesn't officially support Java 25 yet. The `peb-bootstrap/pom.xml` sets `net.bytebuddy.experimental=true` in the surefire configuration to work around this. Remove when a future Spring Boot release upgrades Byte Buddy.

## Database Setup

### 1. Start PostgreSQL

A `pgvector/pgvector:pg17` container should be running on port 5432:

```bash
docker run -d \
  --name pgvector_db \
  -e POSTGRES_DB=nexus \
  -e POSTGRES_USER=pguser \
  -e POSTGRES_PASSWORD=pgpass \
  -p 5432:5432 \
  pgvector/pgvector:pg17
```

### 2. Create the Test Database

The unit tests (`AdmissionControllerFacadeTest`) run against an isolated `peb_test` database with a dedicated user. Create it once:

```bash
# Create the test database and user
docker exec pgvector_db psql -U pguser -d nexus -c "CREATE DATABASE peb_test;"
docker exec pgvector_db psql -U pguser -d nexus -c "CREATE USER peb_test_user WITH PASSWORD 'peb_test_pass';"

# Grant database-level permissions
docker exec pgvector_db psql -U pguser -d peb_test -c "GRANT CONNECT, CREATE ON DATABASE peb_test TO peb_test_user;"
docker exec pgvector_db psql -U pguser -d peb_test -c "GRANT CREATE ON SCHEMA public TO peb_test_user;"
docker exec pgvector_db psql -U pguser -d peb_test -c "ALTER SCHEMA public OWNER TO peb_test_user;"

# Grant peb schema permissions (for V3 migration)
docker exec pgvector_db psql -U pguser -d peb_test -c "CREATE SCHEMA IF NOT EXISTS peb AUTHORIZATION peb_test_user;"
docker exec pgvector_db psql -U pguser -d peb_test -c "GRANT ALL ON SCHEMA peb TO peb_test_user;"
```

## Building

```bash
# Full build (all 10 modules, all tests)
cd peb-kernel
mvn clean install

# Build a single module with its dependencies
mvn -pl peb-bootstrap -am test
```

Build output: ~75s for a clean install. 8 tests (6 contract + 2 integration), 0 expected failures.

## Schema Migrations

Flyway manages the database schema. Migrations live in `peb-store/src/main/resources/db/migration/`:

| Migration | Description |
|---|---|
| `V1__init_peb_schema.sql` | Creates 6 tables in `public` schema with `peb_` prefix |
| `V2__unique_transaction_id.sql` | Adds UNIQUE constraint on `peb_violations.transaction_id` |
| `V3__peb_schema.sql` | Moves tables to dedicated `peb` schema, strips `peb_` prefix |

**Current schema layout** (after V3):

```
peb.state           ← was public.peb_state
peb.transactions    ← was public.peb_transactions
peb.decisions       ← was public.peb_decisions
peb.traces          ← was public.peb_traces
peb.violations      ← was public.peb_violations
peb.capabilities    ← was public.peb_capabilities
```

### How Migrations Run

- **Unit tests**: Flyway runs against the `peb_test` database. V1+V2 create tables in `public`, V3 moves them to `peb`. All 3 migrations execute fresh on each clean database.
- **Production / MCP smoke**: Flyway runs against the `nexus` database. Already-applied migrations are skipped (recorded in `flyway_schema_history`). New migrations are applied in order.

## Testing

### Unit Tests

```bash
# Run all tests
mvn test

# Run specific test class
mvn -pl peb-bootstrap -am test -Dtest=AdmissionControllerFacadeTest
```

### Test Classes

| Test | Module | Type | Count |
|---|---|---|---|
| `ViolationBridgeShapeTest` | peb-domain | JUnit (pure Java, no Spring) | 6 tests |
| `AdmissionControllerFacadeTest` | peb-bootstrap | @SpringBootTest + Flyway | 2 tests |

### MCP Smoke Test (End-to-End)

The TypeScript MCP facade (`typescript/peb-mcp`) runs a shell-based smoke test that starts the Java kernel and sends HTTP requests:

```bash
bash typescript/peb-mcp/scripts/smoke_kernel.sh
```

This tests:
- **MUTATE path**: POST valid `peb_record_decision` → `"Mutation processed"`
- **Violation path**: POST valid `peb_report_violation` → `"Violation recorded as REJECTED"`
- **Malformed path**: POST incomplete payload → 422 JSON error + atomic DB rollback

### Test Infrastructure Notes

- **Database isolation**: Tests use a dedicated `peb_test` database to avoid contaminating the `nexus` database used by the running application.
- **Engine mock**: `AdmissionControllerFacadeTest` mocks `PebGovernanceEngine` with `@MockitoBean` — the test never writes to the database. The database is only needed for Flyway migrations + Hibernate `ddl-auto: validate`.
- **H2 / Testcontainers note**: The project previously used H2 with DDL compatibility hacks. This was migrated to direct PostgreSQL. Testcontainers is not used due to a Docker API version mismatch in this environment (client 1.32 vs required 1.40+).

## Conventions

### Entity Annotations

- All entities use `@Table(schema = "peb", name = "...")` — table names match the schema-prefixed Flyway migrations without the `peb_` prefix.
- `Instant` timestamp fields should use `@Column(columnDefinition = "timestamp with time zone")` when the entity is tested with Hibernate DDL generation (suppresses H2/PostgreSQL precision differences).
- `private` JPA lifecycle callbacks (`@PrePersist`) are not supported by the JPA spec — use `protected` visibility.

### Enum Bridge

The MCP facade sends violation types in lowercase snake_case (`rcl_violation`, `authority_leakage`). The kernel's Java enums normalize these via `ViolationType.fromMcpValue()` / `ViolationSeverity.fromMcpValue()`. The mapping is locked by `ViolationBridgeShapeTest`.

### Error Handling

`MalformedAdmissionRequestException` surfaced by the controller's `@ExceptionHandler` maps to HTTP 422 (Unprocessable Entity). The outer `@Transactional` on `PebGovernanceEngine.processForPath()` rolls back all writes on any `RuntimeException`, preventing orphaned audit rows.
