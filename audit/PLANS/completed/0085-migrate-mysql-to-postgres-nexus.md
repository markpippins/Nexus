---
project: nexus-jvm
dependencies: []
acceptance:
  - ls /home/codex/dev/nexus/jvm/spring/service-registry/src/main/resources/application.properties
  - ls /home/codex/dev/nexus/jvm/spring/service-broker/broker-gateway/src/main/resources/application.properties
  - ls /home/codex/dev/nexus/jvm/spring/service-broker/file-service/src/main/resources/application.properties
  - ls /home/codex/dev/nexus/jvm/spring/topology-server/src/main/resources/application.properties
  - rg "mysql|jdbc:mysql|MySQL|MySQL8Dialect" /home/codex/dev/nexus/jvm/spring -g '!target' -g '!*.class' -g '!*.jar' -g '!dependencies*.txt' 2>&1 || true
---

# Plan 0085: Migrate JVM MySQL Schemas → PostgreSQL `nexus` Database

**Goal:** Migrate all 4 MySQL databases used by JVM Spring Boot services
into the existing PostgreSQL `nexus` database (localhost:5433) using dedicated
schemas. Replace all MySQL JDBC drivers, JPA dialects, and connection configs
with PostgreSQL equivalents. Update test containers from MySQL to PostgreSQL.

**Status:** PLAN — ready for builder pickup

---

## Context: Current MySQL Deployment

| Service | Port | MySQL Database | Tables | JDBC URL |
|---------|------|---------------|--------|----------|
| **service-registry** | 8085 | `service_registry` | 18 entities: services, hosts, frameworks, deployments, servers, service_backends, service_dependencies, service_configs, libraries, visual_components, categories, languages, vendors, server_type, service_types, environment_types, operating_systems, library_categories | `jdbc:mysql://localhost:3306/service_registry` |
| **broker-gateway** | 8081 | `broker_gateway` | users (UserRegistration) | `jdbc:mysql://localhost:3306/broker_gateway` |
| **file-service** | TBD | `file_service` | Hibernate-managed (no explicit entities found) | `jdbc:mysql://localhost:3306/file_service` |
| **topology-server** | 8084 | `topology_server` | broker_profiles, registry_server_profiles | `jdbc:mysql://localhost:3306/topology_server` |

**Shared MySQL credentials:** `root` / `rootpass` on `localhost:3306`

### Target PostgreSQL Configuration

The nexus database on the existing PostgreSQL instance:

```
Host: localhost:5433
Database: nexus
Superuser: pguser / pgpass
Existing schemas: conduit, vector, nebula
New schemas to create: service_registry, broker_gateway, file_service, topology_server
```

Each MySQL database maps to a PostgreSQL **schema** within the `nexus` database.
This keeps them isolated while sharing the same PostgreSQL instance that already
hosts the conduit MCP, nebula RMS, and AI config data.

---

## Phase 1: Schema Translation — MySQL DDL → PostgreSQL DDL

### 1.1 Translation Rules

| MySQL | PostgreSQL |
|-------|-----------|
| `AUTO_INCREMENT` | `SERIAL` or `BIGSERIAL` |
| `VARCHAR(n)` | `VARCHAR(n)` (same) |
| `TEXT` | `TEXT` (same) |
| `BOOLEAN` | `BOOLEAN` (same) |
| `DATETIME` | `TIMESTAMPTZ` |
| `TINYINT(1)` | `BOOLEAN` |
| `ENGINE=InnoDB` | Remove (not applicable) |
| `CREATE DATABASE` | `CREATE SCHEMA` |
| `` `backtick` quoting `` | `"double-quote"` or unquoted lowercase |
| `CHARSET=utf8mb4` | Not needed (UTF-8 is default) |
| `JSON` | `JSONB` |

### 1.2 PostgreSQL Schema Creation

Create 4 schemas in the `nexus` database:

```sql
-- Run as superuser on nexus database (localhost:5433)
CREATE SCHEMA IF NOT EXISTS service_registry;
CREATE SCHEMA IF NOT EXISTS broker_gateway;
CREATE SCHEMA IF NOT EXISTS file_service;
CREATE SCHEMA IF NOT EXISTS topology_server;

-- Set default search path per-service (done in connection string)
```

### 1.3 Schema: `topology_server` (2 entities — simplest, start here)

Source: `jvm/spring/topology-server/src/main/java/.../entity/`

```sql
SET search_path TO topology_server;

CREATE TABLE broker_profiles (
    id                      BIGSERIAL PRIMARY KEY,
    profile_id              VARCHAR(255) NOT NULL UNIQUE,
    name                    VARCHAR(255) NOT NULL,
    broker_url              VARCHAR(255) NOT NULL,
    image_url               VARCHAR(255),
    auto_connect            BOOLEAN NOT NULL DEFAULT FALSE,
    health_check_delay_minutes INTEGER
);

CREATE TABLE registry_server_profiles (
    id                      BIGSERIAL PRIMARY KEY,
    profile_id              VARCHAR(255) NOT NULL UNIQUE,
    name                    VARCHAR(255) NOT NULL,
    registry_server_url     VARCHAR(255) NOT NULL,
    image_url               VARCHAR(255),
    is_active               BOOLEAN NOT NULL DEFAULT FALSE,
    description             VARCHAR(500)
);
```

### 1.4 Schema: `broker_gateway` (1 entity — user-access-service)

Source: `jvm/spring/service-broker/user-access-service/src/main/java/.../model/UserRegistration.java`

```sql
SET search_path TO broker_gateway;

CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    username        VARCHAR(100) NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1.5 Schema: `service_registry` (18 entities — the big one)

Source: `jvm/spring/service-registry/src/main/java/.../entity/`

```sql
SET search_path TO service_registry;

CREATE TABLE server_type (
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE service_types (
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE environment_types (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(500),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE operating_systems (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    version     VARCHAR(50),
    description VARCHAR(500),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vendors (
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE languages (
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE categories (
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE library_categories (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(500),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE servers (
    id                  BIGSERIAL PRIMARY KEY,
    name                VARCHAR(255) NOT NULL,
    hostname            VARCHAR(255),
    ip_address          VARCHAR(45),
    port                INTEGER,
    server_type_id      BIGINT REFERENCES server_type(id),
    operating_system_id BIGINT REFERENCES operating_systems(id),
    description         TEXT,
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE frameworks (
    id               BIGSERIAL PRIMARY KEY,
    name             VARCHAR(100) NOT NULL,
    version          VARCHAR(50),
    language_id      BIGINT REFERENCES languages(id),
    vendor_id        BIGINT REFERENCES vendors(id),
    category_id      BIGINT REFERENCES categories(id),
    description      VARCHAR(500),
    latest_version   VARCHAR(50),
    documentation_url VARCHAR(500),
    github_url       VARCHAR(500),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE services (
    id                BIGSERIAL PRIMARY KEY,
    name              VARCHAR(255) NOT NULL UNIQUE,
    description       TEXT,
    port              INTEGER,
    service_type_id   BIGINT REFERENCES service_types(id),
    host_id           BIGINT REFERENCES servers(id),
    framework_id      BIGINT REFERENCES frameworks(id),
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    version           VARCHAR(50),
    context_path      VARCHAR(255),
    health_check_url  VARCHAR(500),
    management_port   INTEGER,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE service_backends (
    id              BIGSERIAL PRIMARY KEY,
    service_id      BIGINT NOT NULL REFERENCES services(id),
    backend_url     VARCHAR(500) NOT NULL,
    environment_id  BIGINT REFERENCES environment_types(id),
    weight          INTEGER DEFAULT 1,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE service_dependencies (
    id              BIGSERIAL PRIMARY KEY,
    service_id      BIGINT NOT NULL REFERENCES services(id),
    dependency_id   BIGINT NOT NULL REFERENCES services(id),
    dependency_type VARCHAR(50) DEFAULT 'REQUIRED',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE service_configs (
    id           BIGSERIAL PRIMARY KEY,
    service_id   BIGINT NOT NULL REFERENCES services(id),
    config_key   VARCHAR(255) NOT NULL,
    config_value TEXT,
    config_type_id BIGINT REFERENCES service_config_types(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE service_config_types (
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE library (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    version         VARCHAR(50),
    category_id     BIGINT REFERENCES library_categories(id),
    description     TEXT,
    repository_url  VARCHAR(500),
    documentation_url VARCHAR(500),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE service_libraries (
    id         BIGSERIAL PRIMARY KEY,
    service_id BIGINT NOT NULL REFERENCES services(id),
    library_id BIGINT NOT NULL REFERENCES library(id),
    UNIQUE(service_id, library_id)
);

CREATE TABLE visual_components (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    component_type  VARCHAR(50) NOT NULL,
    config_json     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deployments (
    id              BIGSERIAL PRIMARY KEY,
    service_id      BIGINT NOT NULL REFERENCES services(id),
    host_id         BIGINT REFERENCES servers(id),
    environment_id  BIGINT REFERENCES environment_types(id),
    status          VARCHAR(50) DEFAULT 'pending',
    deployed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Note:** Some entities may have additional fields. The full schema should be
generated by running the Spring Boot app with `ddl-auto=create` against a
throwaway PostgreSQL database, then dumping the DDL. The above is based on
the JPA entity annotations visible in the codebase.

### 1.6 Schema: `file_service`

The file-service has no explicit JPA entities found in the code search.
Use Hibernate `ddl-auto=update` to auto-generate the schema on PostgreSQL,
then inspect and formalize.

---

## Phase 2: Data Migration — MySQL → PostgreSQL

### 2.1 Option A: pgloader (Recommended)

[pgloader](https://pgloader.io/) handles MySQL→PostgreSQL including type
casting, index creation, and sequence resetting:

```bash
# Install pgloader
sudo apt install pgloader  # or brew install pgloader

# Migrate each database as a schema
pgloader mysql://root:rootpass@localhost:3306/topology_server \
         pgsql://pguser:pgpass@localhost:5433/nexus?topology_server

pgloader mysql://root:rootpass@localhost:3306/broker_gateway \
         pgsql://pguser:pgpass@localhost:5433/nexus?broker_gateway

pgloader mysql://root:rootpass@localhost:3306/file_service \
         pgsql://pguser:pgpass@localhost:5433/nexus?file_service

pgloader mysql://root:rootpass@localhost:3306/service_registry \
         pgsql://pguser:pgpass@localhost:5433/nexus?service_registry
```

This preserves data, resets sequences, and handles type coercion.

### 2.2 Option B: Manual Export/Import

If pgloader isn't available:

```bash
# 1. Dump MySQL data as SQL
mysqldump -u root -prootpass --compatible=postgresql \
  --no-create-info --complete-insert \
  topology_server > topology_server_data.sql

# 2. Run DDL on PostgreSQL (from Phase 1)
psql -h localhost -p 5433 -U pguser -d nexus \
  -c "SET search_path TO topology_server" \
  -f topology_server_schema.sql

# 3. Import data (with manual fixes for MySQL-isms)
psql -h localhost -p 5433 -U pguser -d nexus \
  -c "SET search_path TO topology_server" \
  -f topology_server_data.sql

# 4. Reset sequences
psql -h localhost -p 5433 -U pguser -d nexus <<'EOF'
SELECT setval('topology_server.broker_profiles_id_seq',
  COALESCE((SELECT MAX(id) FROM topology_server.broker_profiles), 1));
SELECT setval('topology_server.registry_server_profiles_id_seq',
  COALESCE((SELECT MAX(id) FROM topology_server.registry_server_profiles), 1));
EOF
```

### 2.3 Option C: Spring Boot Hibernate ddl-auto

For services where data loss is acceptable (dev environment), simply point
the Spring Boot app at PostgreSQL with `ddl-auto=update` and let Hibernate
create the schema. Then manually seed any required data from JSON config files.

---

## Phase 3: JDBC Driver & Dependency Migration

### 3.1 Replace MySQL Driver with PostgreSQL Driver

**Root `pom.xml`** (`jvm/spring/service-broker/pom.xml`):

```xml
<!-- REMOVE -->
<mysql.connector.version>8.0.33</mysql.connector.version>

<!-- ADD -->
<postgresql.version>42.7.3</postgresql.version>
```

```xml
<!-- REMOVE -->
<dependency>
    <groupId>com.mysql</groupId>
    <artifactId>mysql-connector-j</artifactId>
    <version>${mysql.connector.version}</version>
</dependency>
<dependency>
    <groupId>mysql</groupId>
    <artifactId>mysql-connector-java</artifactId>
    <version>${mysql.connector.version}</version>
</dependency>

<!-- ADD -->
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <version>${postgresql.version}</version>
</dependency>
```

### 3.2 Per-Service `pom.xml` Updates

**Files affected (remove mysql-connector, add postgresql if not inherited):**

| File | Action |
|------|--------|
| `jvm/spring/service-broker/pom.xml` | Remove mysql props, add postgresql dependency |
| `jvm/spring/service-broker/broker-gateway/pom.xml` | Remove `mysql-connector-j`, add `postgresql` |
| `jvm/spring/service-broker/broker-service/pom.xml` | Remove `mysql-connector-j` + `mysql-connector-java`, add `postgresql` |
| `jvm/spring/service-broker/file-service/pom.xml` | Remove mysql connector if present |
| `jvm/spring/service-broker/user-access-service/pom.xml` | Remove `mysql-connector-j` + `mysql`, add `postgresql` |
| `jvm/spring/service-registry/pom.xml` | Remove `mysql-connector-j`, add `postgresql` |
| `jvm/spring/topology-server/pom.xml` | Remove `mysql-connector-j`, add `postgresql` |
| `jvm/spring/service-broker/admin-logging/pom.xml` | Remove `mysql-connector-java` |

### 3.3 Remove `mysql-connector-java` (Legacy Maven Coordinate)

The `mysql:mysql-connector-java` artifact was relocated to `com.mysql:mysql-connector-j`.
Clean up all references — both are being removed.

---

## Phase 4: Spring Boot Configuration Migration

### 4.1 `application.properties` Updates — All 4 Services

**Pattern for every service:**

```properties
# REMOVE
spring.datasource.url=jdbc:mysql://localhost:3306/<db>?createDatabaseIfNotExist=true&useSSL=false&allowPublicKeyRetrieval=true
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver
spring.jpa.database-platform=org.hibernate.dialect.MySQL8Dialect

# ADD
spring.datasource.url=jdbc:postgresql://localhost:5433/nexus?currentSchema=<schema>
spring.datasource.driver-class-name=org.postgresql.Driver
spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect
```

**Per-service JDBC URLs:**

| Service | New JDBC URL |
|---------|-------------|
| service-registry | `jdbc:postgresql://localhost:5433/nexus?currentSchema=service_registry` |
| broker-gateway | `jdbc:postgresql://localhost:5433/nexus?currentSchema=broker_gateway` |
| file-service | `jdbc:postgresql://localhost:5433/nexus?currentSchema=file_service` |
| topology-server | `jdbc:postgresql://localhost:5433/nexus?currentSchema=topology_server` |

**PostgreSQL credentials:** `pguser` / `pgpass` (same as conduit MCP)

### 4.2 Specific File Updates

**File: `jvm/spring/service-registry/src/main/resources/application.properties`**

```properties
# REMOVE lines 7-9, 14
spring.datasource.url=jdbc:mysql://localhost:3306/service_registry?createDatabaseIfNotExist=true&useSSL=false&allowPublicKeyRetrieval=true
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver
spring.jpa.database-platform=org.hibernate.dialect.MySQL8Dialect

# ADD
spring.datasource.url=jdbc:postgresql://localhost:5433/nexus?currentSchema=service_registry
spring.datasource.driver-class-name=org.postgresql.Driver
spring.datasource.username=pguser
spring.datasource.password=pgpass
spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect
```

**File: `jvm/spring/service-broker/broker-gateway/src/main/resources/application.properties`**

```properties
# REMOVE lines 39-44
# ADD PostgreSQL equivalent (same pattern as above)
```

**File: `jvm/spring/service-broker/file-service/src/main/resources/application.properties`**

```properties
# REMOVE lines 15-20
# ADD PostgreSQL equivalent with currentSchema=file_service
```

**File: `jvm/spring/topology-server/src/main/resources/application.properties`**

```properties
# REMOVE lines 4-9
# ADD PostgreSQL equivalent with currentSchema=topology_server
# Also update line 9 from MySQLDialect to PostgreSQLDialect
```

### 4.3 Hibernate ddl-auto Strategy

Keep `spring.jpa.hibernate.ddl-auto=update` for all services. PostgreSQL
schema will be managed by Hibernate after the initial DDL migration.

**PostgreSQL-specific Hibernate settings to add:**

```properties
# PostgreSQL sequence strategy (avoids hibernate_sequence issues)
spring.jpa.properties.hibernate.id.new_generator_mappings=true
spring.jpa.properties.hibernate.jdbc.lob.non_contextual_creation=true
```

---

## Phase 5: Test Container Migration

### 5.1 user-access-service Tests

**Files affected:**
- `jvm/spring/service-broker/user-access-service/src/test/java/.../integration/UserAccessServiceIntegrationTest.java`
- `jvm/spring/service-broker/user-access-service/src/test/java/.../e2e/UserAccessServiceE2ETest.java`

**Changes:**

```java
// REMOVE
import org.testcontainers.containers.MySQLContainer;
static MySQLContainer<?> mysqlContainer = new MySQLContainer<>("mysql:8.0")
    .withDatabaseName("testdb")
    .withUsername("test")
    .withPassword("test");
registry.add("spring.datasource.url", mysqlContainer::getJdbcUrl);
registry.add("spring.datasource.username", mysqlContainer::getUsername);
registry.add("spring.datasource.password", mysqlContainer::getPassword);

// ADD
import org.testcontainers.containers.PostgreSQLContainer;
static PostgreSQLContainer<?> postgresContainer = new PostgreSQLContainer<>("postgres:16")
    .withDatabaseName("testdb")
    .withUsername("test")
    .withPassword("test");
registry.add("spring.datasource.url", postgresContainer::getJdbcUrl);
registry.add("spring.datasource.username", postgresContainer::getUsername);
registry.add("spring.datasource.password", postgresContainer::getPassword);
```

### 5.2 Test Dependency Update

**File: `jvm/spring/service-broker/user-access-service/pom.xml`**

```xml
<!-- ADD -->
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>postgresql</artifactId>
    <scope>test</scope>
</dependency>
```

**Also add to service-registry pom.xml** if it has integration tests using
databases.

---

## Phase 6: Topology Server Dependency Audit

The topology-server's `pom.xml` has a `<parent>` pointing to `service-broker/pom.xml`:

```xml
<parent>
    <groupId>com.aibizarchitect.nexus</groupId>
    <artifactId>nexus</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <relativePath>../service-broker/pom.xml</relativePath>
</parent>
```

This means topology-server inherits MySQL dependencies from the service-broker
parent POM. After migrating the parent POM, topology-server automatically
picks up the PostgreSQL driver.

**Topology server itself has its own `mysql-connector-j` dependency** (runtime scope),
which must be explicitly removed/replaced in `topology-server/pom.xml`.

### 6.1 Dependency Chain Summary

```
service-broker/pom.xml (parent)
  ├─ REMOVE: mysql-connector-j:8.0.33
  ├─ REMOVE: mysql-connector-java:8.0.33
  └─ ADD:    postgresql:42.7.3

topology-server/pom.xml (child, inherits from service-broker)
  └─ REMOVE: mysql-connector-j (runtime)
  └─ ADD:    postgresql (runtime)
```

---

## Phase 7: Service Restart & Verification

### 7.1 Startup Order

1. Ensure PostgreSQL is running on `localhost:5433`
2. Run schema DDL (Phase 1) to create the 4 schemas
3. Run data migration (Phase 2) to move existing data
4. Stop all 4 services (if running)
5. Deploy updated JARs with PostgreSQL configs
6. Start services in dependency order:
   a. `service-registry` (8085) — no dependencies
   b. `file-service` — depends on registry for registration
   c. `broker-gateway` (8081) — depends on registry
   d. `topology-server` (8084) — depends on broker-gateway parent POM

### 7.2 Verification Commands

```bash
# 1. Verify PostgreSQL connectivity per service
psql -h localhost -p 5433 -U pguser -d nexus \
  -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('service_registry','broker_gateway','file_service','topology_server')"

# 2. Verify table counts
for schema in service_registry broker_gateway file_service topology_server; do
  echo "=== $schema ==="
  psql -h localhost -p 5433 -U pguser -d nexus \
    -c "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema='$schema'"
done

# 3. Verify data migration (row counts)
for schema in service_registry broker_gateway file_service topology_server; do
  echo "=== $schema ==="
  psql -h localhost -p 5433 -U pguser -d nexus \
    -c "SELECT schemaname, relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname='$schema'"
done

# 4. Health check each service
curl -s http://localhost:8085/actuator/health | jq .
curl -s http://localhost:8081/actuator/health | jq .
curl -s http://localhost:8084/actuator/health | jq .

# 5. Verify zero MySQL references remain in configs
rg "mysql|MySQL|MySQL8Dialect" /home/codex/dev/nexus/jvm/spring \
  -g '*.properties' -g '*.java' -g 'pom.xml' -g '!target' -g '!dependencies*.txt'

# 6. Run tests (if they exist)
cd /home/codex/dev/nexus/jvm/spring/service-registry && mvn test -DskipTests=false 2>&1 | tail -20
cd /home/codex/dev/nexus/jvm/spring/service-broker && mvn test -DskipTests=false 2>&1 | tail -20
```

---

## Phase 8: Documentation Updates

### Files to Update

| File | Change |
|------|--------|
| `service-registry/README.md` | MySQL → PostgreSQL references in architecture diagrams, config examples |
| `service-registry/REFERENCE.md` | Update JDBC URL, driver class name, dialect |
| `service-broker/broker-gateway/README.md` | MySQL → PostgreSQL |
| `topology-server/README.md` | "Database: MySQL" → "Database: PostgreSQL (schema: topology_server)" |
| `nexus/ARCHITECTURE.md` | Update service topology table — database column |

---

## Files Affected Summary

### POM Files (7 files)
| File | Action |
|------|--------|
| `jvm/spring/service-broker/pom.xml` | Remove mysql props + deps, add postgresql |
| `jvm/spring/service-broker/broker-gateway/pom.xml` | Remove mysql-connector-j, add postgresql |
| `jvm/spring/service-broker/broker-service/pom.xml` | Remove mysql deps, add postgresql |
| `jvm/spring/service-broker/file-service/pom.xml` | Remove mysql connector if present |
| `jvm/spring/service-broker/user-access-service/pom.xml` | Remove mysql deps, add postgresql + testcontainers-postgresql |
| `jvm/spring/service-registry/pom.xml` | Remove mysql-connector-j, add postgresql |
| `jvm/spring/topology-server/pom.xml` | Remove mysql-connector-j, add postgresql |

### Application Properties (4 files)
| File | Action |
|------|--------|
| `service-registry/src/main/resources/application.properties` | MySQL→PostgreSQL JDBC, driver, dialect, credentials |
| `service-broker/broker-gateway/src/main/resources/application.properties` | Same |
| `service-broker/file-service/src/main/resources/application.properties` | Same |
| `topology-server/src/main/resources/application.properties` | Same |

### Test Files (2 files)
| File | Action |
|------|--------|
| `user-access-service/src/test/.../UserAccessServiceIntegrationTest.java` | MySQLContainer → PostgreSQLContainer |
| `user-access-service/src/test/.../UserAccessServiceE2ETest.java` | MySQLContainer → PostgreSQLContainer |

### Documentation (4+ files)
| File | Action |
|------|--------|
| `service-registry/README.md` | MySQL → PostgreSQL |
| `service-registry/REFERENCE.md` | MySQL → PostgreSQL |
| `topology-server/README.md` | MySQL → PostgreSQL |
| `nexus/ARCHITECTURE.md` | Update service topology database column |

### Database (new artifacts)
| Artifact | Purpose |
|----------|---------|
| `nexus/schema/service_registry.sql` | PostgreSQL DDL for service_registry schema |
| `nexus/schema/broker_gateway.sql` | PostgreSQL DDL for broker_gateway schema |
| `nexus/schema/file_service.sql` | PostgreSQL DDL for file_service schema |
| `nexus/schema/topology_server.sql` | PostgreSQL DDL for topology_server schema |
| `nexus/scripts/migrate-mysql-to-pg.sh` | Data migration script (pgloader or manual) |

---

## Acceptance Criteria

1. **4 PostgreSQL schemas exist** in the `nexus` database: `service_registry`, `broker_gateway`, `file_service`, `topology_server`
2. **All tables created** — row counts match between MySQL and PostgreSQL
3. **Zero MySQL references** in `application.properties` files — `rg "mysql|MySQL8Dialect"` returns empty
4. **Zero MySQL dependencies** in POM files — `rg "mysql-connector" pom.xml` returns empty
5. **All services start** and respond to `/actuator/health` on their respective ports
6. **service-registry** (8085) registers services successfully
7. **broker-gateway** (8081) proxies requests correctly
8. **topology-server** (8084) returns broker/registry profiles from PostgreSQL
9. **Tests pass** — `mvn test` for user-access-service (with PostgreSQLContainer)
10. **MySQL can be stopped** — no service depends on it after migration

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| **MySQL AUTO_INCREMENT → PostgreSQL SERIAL mismatch** | pgloader handles sequence resetting. Manual: `SELECT setval('seq', MAX(id))` |
| **Hibernate generates different DDL on PostgreSQL** | Run with `ddl-auto=validate` first to compare; fix entity annotations if needed |
| **MySQL-specific SQL in repository queries** | Grep for `nativeQuery` and `@Query` with MySQL syntax; rewrite for PostgreSQL |
| **`createDatabaseIfNotExist` has no PG equivalent** | Use `currentSchema=<schema>` in JDBC URL; create schema manually |
| **JSON column type differs (MySQL JSON vs PG JSONB)** | Hibernate maps both to String/VARCHAR by default; check entity `@Column` annotations |
| **Data migration downtime** | Perform during maintenance window; services are dev-local, downtime is minimal |
| **file-service entities unknown** | Point at PostgreSQL with `ddl-auto=update` to auto-generate, then dump DDL |

---

*Plan created: 2026-06-15. Part of the MySQL deprecation and PostgreSQL consolidation series.*
