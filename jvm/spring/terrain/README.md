# Terrain Server

Spring Boot microservice that centralizes infrastructure topology — the canonical registry of all Nexus services, servers, MCP servers, CLI tools, and their configuration.

Replaces the IndexedDB storage previously used by the nexus-console frontend.

## Overview

- **Port:** 8084
- **Framework:** Spring Boot 3.5.0 / Java 21
- **Database:** PostgreSQL (schema: `terrain`)
- **Path:** `jvm/spring/terrain/`

## Data Model

### Service Types

Lookup table categorizing all registered services.

| Field | Type | Description |
|-------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `name` | VARCHAR | Unique type name (e.g. "MCP", "Microservice", "Express", "Proxy", "Bun", "Spring Boot") |

### Servers / Hosts

Physical or virtual machines where services run.

| Field | Type | Description |
|-------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `hostname` | VARCHAR | Unique hostname (e.g. "localhost") |
| `ipAddress` | VARCHAR | IP address |
| `os` | VARCHAR | Operating system |
| `status` | VARCHAR | Current status (ONLINE, OFFLINE, etc.) |
| `activeFlag` | BOOLEAN | Whether this server is active |

### MCP Servers

MCP (Model Context Protocol) server instances — separate from microservices for modular type modeling.

| Field | Type | Description |
|-------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `name` | VARCHAR | Display name (e.g. "conduit-mcp") |
| `port` | INTEGER | Port the MCP server listens on |
| `workspacePath` | VARCHAR | Relative path from nexus root (e.g. "typescript/conduit-mcp") |
| `serviceTypeId` | FK→service_types | Service type (typically MCP) |
| `healthCheckUrl` | VARCHAR | Health check endpoint URL |
| `status` | VARCHAR | ON / OFFLINE / DEGRADED |
| `transportType` | VARCHAR | Transport protocol (sse, stdio) |
| `version` | VARCHAR | Version string |
| `description` | VARCHAR | Notes / description |
| `repositoryUrl` | VARCHAR | Source repository path or URL |
| `activeFlag` | BOOLEAN | Whether this MCP server is active |

### Runnable Services / Microservices

Standalone runnable services and microservices (Express, Bun, proxy servers, etc.).

| Field | Type | Description |
|-------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `name` | VARCHAR | Display name (e.g. "nebula-srv") |
| `port` | INTEGER | Port the service listens on |
| `workspacePath` | VARCHAR | Relative path from nexus root (e.g. "typescript/nebula-srv") |
| `serviceTypeId` | FK→service_types | Service type (Microservice, Express, Proxy, Bun, etc.) |
| `healthCheckUrl` | VARCHAR | Health check endpoint URL |
| `status` | VARCHAR | ON / OFFLINE / DEGRADED |
| `version` | VARCHAR | Version string |
| `description` | VARCHAR | Notes / description |
| `repositoryUrl` | VARCHAR | Source repository path or URL |
| `activeFlag` | BOOLEAN | Whether this service is active |

### Service Dependencies

Polymorphic dependency graph — tracks which services (of any type) depend on which other services or servers.

| Field | Type | Description |
|-------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `sourceType` | VARCHAR | Type of the dependent (McpServer, RunnableService, Server) |
| `sourceId` | BIGINT | ID of the dependent service |
| `targetType` | VARCHAR | Type of the dependency (McpServer, RunnableService, Server) |
| `targetId` | BIGINT | ID of the depended-on service |
| `criticality` | VARCHAR | REQUIRED / OPTIONAL / etc. |
| `description` | VARCHAR | Notes about this dependency |

### Broker Profiles

Stores connection details for broker gateway instances. Each profile is uniquely identified by a `profileId` string key.

| Field | Type | Description |
|-------|------|-------------|
| `profileId` | VARCHAR | Unique key (e.g. `"default-local"`) |
| `name` | VARCHAR | Display name |
| `brokerUrl` | VARCHAR | Gateway URL (e.g. `"localhost:8081"`) |
| `imageUrl` | VARCHAR | Image server URL |
| `autoConnect` | BOOLEAN | Auto-connect on app startup |
| `healthCheckDelayMinutes` | INTEGER | Health check polling interval |

### Registry Server Profiles

Stores service registry connection configurations. Each profile is uniquely identified by a `profileId` string key.

| Field | Type | Description |
|-------|------|-------------|
| `profileId` | VARCHAR | Unique key (e.g. `"default-local-host"`) |
| `name` | VARCHAR | Display name |
| `registryServerUrl` | VARCHAR | Service registry URL |
| `imageUrl` | VARCHAR | Image server URL |
| `isActive` | BOOLEAN | Whether this is the active profile |
| `description` | VARCHAR | Notes (optional) |

## REST API

All endpoints return `PagedResponse<T>` matching the service-registry response format.

### Service Types

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/service-types` | List all (paginated, sorted by name) |
| `GET` | `/api/v1/service-types/{id}` | Get by database ID |
| `POST` | `/api/v1/service-types` | Create new |
| `PUT` | `/api/v1/service-types/{id}` | Update existing |
| `DELETE` | `/api/v1/service-types/{id}` | Delete |

### Servers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/servers` | List all (paginated, sorted by hostname) |
| `GET` | `/api/v1/servers/{id}` | Get by database ID |
| `POST` | `/api/v1/servers` | Create new |
| `PUT` | `/api/v1/servers/{id}` | Update existing |
| `DELETE` | `/api/v1/servers/{id}` | Delete |

### MCP Servers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/mcp-servers` | List all (paginated, sorted by name) |
| `GET` | `/api/v1/mcp-servers/{id}` | Get by database ID |
| `POST` | `/api/v1/mcp-servers` | Create new |
| `PUT` | `/api/v1/mcp-servers/{id}` | Update existing |
| `DELETE` | `/api/v1/mcp-servers/{id}` | Delete |

### Runnable Services

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/runnable-services` | List all (paginated, sorted by name) |
| `GET` | `/api/v1/runnable-services/{id}` | Get by database ID |
| `POST` | `/api/v1/runnable-services` | Create new |
| `PUT` | `/api/v1/runnable-services/{id}` | Update existing |
| `DELETE` | `/api/v1/runnable-services/{id}` | Delete |

### Service Dependencies

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/service-dependencies` | List all (paginated) |
| `GET` | `/api/v1/service-dependencies/{id}` | Get by database ID |
| `GET` | `/api/v1/service-dependencies/by-source?sourceType=X&sourceId=Y` | Get all deps for a source |
| `GET` | `/api/v1/service-dependencies/by-target?targetType=X&targetId=Y` | Get all deps for a target |
| `POST` | `/api/v1/service-dependencies` | Create new |
| `PUT` | `/api/v1/service-dependencies/{id}` | Update existing |
| `DELETE` | `/api/v1/service-dependencies/{id}` | Delete |

### Broker Profiles

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/broker-profiles` | List all (paginated, sorted by name) |
| `GET` | `/api/v1/broker-profiles/{id}` | Get by database ID |
| `POST` | `/api/v1/broker-profiles` | Create new |
| `PUT` | `/api/v1/broker-profiles/{id}` | Update existing |
| `DELETE` | `/api/v1/broker-profiles/{id}` | Delete |

### Registry Server Profiles

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/registry-server-profiles` | List all (paginated, sorted by name) |
| `GET` | `/api/v1/registry-server-profiles/{id}` | Get by database ID |
| `POST` | `/api/v1/registry-server-profiles` | Create new |
| `PUT` | `/api/v1/registry-server-profiles/{id}` | Update existing |
| `DELETE` | `/api/v1/registry-server-profiles/{id}` | Delete |

## Seeding

A `CommandLineRunner` (`TopologyDataInitializer`) reads default profile data from JSON config files on first startup:

- `src/main/resources/config/broker-profiles.json`
- `src/main/resources/config/registry-server-profiles.json`

If the database already contains records, seeding is skipped. This ensures data persists across restarts.

## Running

```bash
cd jvm/spring/terrain
mvn spring-boot:run
```

Requires PostgreSQL running on `localhost:5432`. The `terrain` schema must exist in the `nexus` database. Tables are auto-created by Hibernate on first connect.

## Migration from IndexedDB

The nexus-console frontend currently stores profile data in browser IndexedDB. After the topology server is running and the frontend is updated, profile data will be retrieved from this server's REST API instead. The IndexedDB stores (`broker-profiles`, `registry-server-profiles`) will become obsolete and can be removed from the `DbService`.
