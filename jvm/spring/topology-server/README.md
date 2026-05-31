# Topology Server

Spring Boot microservice that centralizes broker gateway and service registry configuration, replacing the IndexedDB storage previously used by the nexus-console frontend.

## Overview

- **Port:** 8084
- **Framework:** Spring Boot 3.5.0 / Java 21
- **Database:** MySQL (schema: `topology_server`)
- **Path:** `jvm/spring/topology-server/`

## Data Model

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
cd jvm/spring/topology-server
mvn spring-boot:run
```

Requires MySQL running on `localhost:3306`. The database `topology_server` is auto-created on first connect.

## Migration from IndexedDB

The nexus-console frontend currently stores profile data in browser IndexedDB. After the topology server is running and the frontend is updated, profile data will be retrieved from this server's REST API instead. The IndexedDB stores (`broker-profiles`, `registry-server-profiles`) will become obsolete and can be removed from the `DbService`.
