# Nexus Topology — Candidate List

> Generated 2026-06-19. For review before populating the `terrain` schema
> in the `nexus` PostgreSQL database (used by `topology-server` on port 8084).

---

## Schema Capability Assessment: Startup Procedures

The current `terrain` schema (see `jvm/spring/terrain/schema.sql`) has
**no fields for startup procedures** on any entity table. The relevant
candidate fields across all tables are:

| Field | Table(s) | Present? |
|---|---|---|
| `workspacePath` | `mcp_servers`, `runnable_services` | Yes |
| `healthCheckUrl` | `mcp_servers`, `runnable_services` | Yes |
| `port` | `mcp_servers`, `runnable_services` | Yes |
| `version` | `mcp_servers`, `runnable_services` | Yes |
| `description` | `mcp_servers`, `runnable_services` | Yes |
| `repositoryUrl` | `mcp_servers`, `runnable_services` | Yes |
| `transportType` | `mcp_servers` | Yes |
| **startupCommand** | — | **MISSING** |
| **startupScript** | — | **MISSING** |
| **buildCommand** | — | **MISSING** |
| **runtimeNotes** | — | **MISSING** |

**Recommendation:** Add a `startup_command VARCHAR(1000)` and/or
`startup_notes VARCHAR(2000)` field to `runnable_services` and `mcp_servers`
if startup procedure documentation is a goal. The existing `description`
field could be repurposed as a stopgap.

---

## Infrastructure Dependencies

These are external services the Nexus platform depends on, recorded as
`Server` rows (or a dedicated infrastructure table).

| # | Name | Type | Host | Port | Status |
|---|---|---|---|---|---|
| 1 | PostgreSQL | Database | localhost | 5432 | ONLINE |
| 2 | NATS | Message Broker | localhost | 4222 | ONLINE |
| 3 | Redis | Cache | localhost | 6379 | ONLINE |
| 4 | MongoDB | Document DB | localhost | 27017 | ONLINE |

---

## Angular / React UI Apps

Recorded as `RunnableService` rows (type: "Microservice" or new type "UI").

| # | Name | Framework | Port | Path | Health |
|---|---|---|---|---|---|
| 5 | nexus-console | Angular 20 | 4200 | `angular/nexus-console/` | `http://localhost:4200` |
| 6 | nebula-ui | Angular 21 | 3000 | `angular/nebula-ui/` | `http://localhost:3000` |
| 7 | conduit-ui | Angular 19 | 4200* | `angular/conduit-ui/` | `http://localhost:4200` |
| 8 | nexus-orb | Angular 21 | 4200* | `angular/nexus-orb/` | `http://localhost:4200` |
| 9 | duality-ui | React 19 / Vite | 3000* | `angular/duality-ui/` | `http://localhost:3000` |
| 10 | plurality-ui | React 19 / Vite | 3001 | `angular/plurality-ui/` | `http://localhost:3001` |
| 11 | prompt-architect | React 19 / Vite | 3000* | `angular/prompt-architect/` | `http://localhost:3000` |

\* Default Angular/Vite dev server port; may need `--port` override to avoid conflicts.

---

## TypeScript MCP Servers

Recorded as `McpServer` rows (type: "MCP").

| # | Name | Port | Path | Transport | Dependencies |
|---|---|---|---|---|---|
| 12 | conduit-mcp | 3100 | `typescript/conduit-mcp/` | SSE | nebula-srv |
| 13 | nebula-mcp | 3102 | `typescript/nebula-mcp/` | SSE | nebula-srv |
| 14 | peb-mcp | TBD | `typescript/peb-mcp/` | SSE | peb-kernel |

---

## TypeScript Runnable Services

Recorded as `RunnableService` rows (type varies).

| # | Name | Port | Type | Path | Status |
|---|---|---|---|---|---|
| 15 | nebula-srv | 3101 | Express | `typescript/nebula-srv/` | ONLINE |
| 16 | image-server | 8083 | Bun | `typescript/image-server/` | OFFLINE |
| 17 | file-system-server | 4040 | Bun | `typescript/file-system-server/` | OFFLINE |
| 18 | broker-service-proxy | 8082 | Express | `typescript/broker-service-proxy/` | OFFLINE |
| 19 | mock-broker-service | 8099 | Express | `typescript/mock-broker-service/` | OFFLINE |
| 20 | google-search-service | 8082 | Node/Express | `typescript/google/` | OFFLINE |
| 21 | broker-gateway-proxy *(TS)* | TBD | Express | `typescript/broker-gateway-proxy/` | OFFLINE |

**Note:** `broker-client` (`typescript/broker-client/`) is an SDK library, not a server — excluded.

---

## JVM Spring (Monolith Entries Only — Not Subprojects)

Recorded as `RunnableService` rows (type: "Spring Boot").

| # | Name | Port | Artifact | Path |
|---|---|---|---|---|
| 22 | service-registry | 8085 | `service-registry` | `jvm/spring/service-registry/` |
| 23 | service-broker *(aggregator)* | 8081 | `nexus` (pom) | `jvm/spring/service-broker/` |
| 24 | terrain | 8084 | `terrain` | `jvm/spring/terrain/` |
| 25 | peb-kernel *(aggregator)* | TBD | `peb-kernel` (pom) | `jvm/spring/peb-kernel/` |

**service-broker** subprojects (excluded per user instruction): admin-logging,
broker-discovery-service, broker-gateway, broker-gateway-sec-bot, broker-service,
file-service, file-service-api, login-service, note-service, search-service,
upload-service, user-access-service, user-service, broker-service-spi.

**peb-kernel** sub-modules: peb-domain, peb-store, peb-core, peb-hash, peb-api,
peb-adapters, peb-observability, peb-bootstrap, peb-test.

---

## JVM Helidon

| # | Name | Port | Type | Path | Description |
|---|---|---|---|---|---|
| 26 | user-access-service | 9093 | Helidon | `jvm/helidon/user-access-service/` | User access service with PostgreSQL backend |

---

## JVM Quarkus

| # | Name | Port | Type | Path | Description |
|---|---|---|---|---|---|
| 27 | quarkus-broker-gateway | 8090 | Quarkus | `jvm/quarkus/broker-gateway/` | Polyglot broker gateway (complements Spring version) |

---

## JVM Ballerina

| # | Name | Port | Type | Path |
|---|---|---|---|---|
| 28 | demo-package | 9000 | Ballerina | `jvm/ballerina/demo_package/` |

---

## Go

| # | Name | Type | Path | Description |
|---|---|---|---|---|
| 29 | ccnf-ref | CLI Oracle | `go/wrp/ccnf-ref/` | CCNF reference oracle — NOT a server |

---

## Rust

| # | Name | Type | Path | Description |
|---|---|---|---|---|
| 30 | ccnf-verifier | CLI Verifier | `rust/wrp/ccnf-verifier/` | Cross-language CCNF verifier — NOT a server |

---

## Moleculer (Microservice Mesh — Uses NATS)

| # | Name | Type | Path | Description |
|---|---|---|---|---|
| 31 | moleculer-search | Moleculer | `moleculer/search/` | Search microservice mesh (NATS transport) |

---

## AdonisJS

| # | Name | Port | Type | Path |
|---|---|---|---|---|
| 32 | broker-gateway-proxy *(AdonisJS)* | TBD | AdonisJS | `adonisjs/broker-gateway-proxy/` |

---

## Python

| # | Name | Port | Type | Path | Status |
|---|---|---|---|---|---|
| 33 | voyager | TBD | Python/NATS | `python/voyager/` | TBD |
| 34 | cascade (event-pipeline) | TBD | Python/NATS | `python/cascade/` | TBD |
| 35 | losm-kernel | 8000 | Python/FastAPI | `python/vision/losm-kernel/` | TBD |
| 36 | losm-shell | — | Python CLI | `python/vision/losm-shell/` | TBD |
| 37 | losm-store | TBD | Python | `python/vision/losm-store/` | TBD |
| 38 | losm-ir | TBD | Python | `python/vision/losm-ir/` | TBD |
| 39 | losm-host | TBD | Python | `python/vision/losm-host/` | TBD |
| 40 | fs-crawler | TBD | Python | `python/fs/fs-crawler/` | TBD |
| 41 | mcp-hello | TBD | Python/MCP | `python/mcp-hello/` | TBD |

---

## Summary Counts

| Category | Count |
|---|---|
| Infrastructure | 4 |
| Angular/React UI | 7 |
| TypeScript MCP | 3 |
| TypeScript Services | 7 |
| Spring (monolith entries) | 4 |
| Helidon | 1 |
| Quarkus | 1 |
| Ballerina | 1 |
| Go/Rust (CLI tools) | 2 |
| Moleculer | 1 |
| AdonisJS | 1 |
| Python | 9 |
| **Total candidates** | **41** |

---

## Notes & Open Questions

1. **Port conflicts:** Several services share default ports (3000, 4200, 8082).
   Actual runtime ports should be confirmed from running instances or
   `docker-compose` configurations.

2. **CLI tools:** `ccnf-ref` (Go) and `ccnf-verifier` (Rust) are CLI tools,
   not servers. Should they be in the terrain? They don't have ports or
   health checks.

3. **SDK libraries:** `broker-client` and `utils` are libraries, not
   servers — excluded.

4. **TBD ports:** Several services need port confirmation — notably peb-mcp,
   the AdonisJS proxy, Ballerina demo, Moleculer search, and most Python
   services.

5. **Spring service-broker:** The monolith has 14 submodules. They share a
   parent POM and are built together. Should the terrain record them as one
   entry or multiple? User instructed one entry.

6. **Duplicate names:** Two `broker-gateway-proxy` projects exist (TypeScript
   and AdonisJS) and two `user-access-service` projects exist (Spring Boot
   and Helidon). Names should be disambiguated in the terrain.

7. **Service Dependencies:** A separate pass should map dependencies (e.g.,
   conduit-mcp → nebula-srv, nebula-mcp → nebula-srv, all services →
   PostgreSQL, Moleculer → NATS).
