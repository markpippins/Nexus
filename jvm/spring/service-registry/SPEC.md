# Service Registry — Specification

## Functional Requirements

- Maintain a central registry of all active service instances
- Support service registration, heartbeat renewal, and deregistration
- Provide service discovery by name for client-side load balancing
- Monitor service health with configurable eviction of stale instances
- Support self-preservation mode during network partitions

## Non-Functional Requirements

- Registration propagation within 5 seconds
- Availability: 99.99% uptime (critical infrastructure)
- Support 500+ concurrently registered service instances
- P99 lookup latency under 10ms

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/registry/register | Register a new service instance |
| POST | /api/registry/renew | Renew instance lease (heartbeat) |
| DELETE | /api/registry/{instanceId} | Deregister a service instance |
| GET | /api/registry/services | List all registered services |
| GET | /api/registry/services/{name} | Get instances for a specific service |
| GET | /api/registry/instances/{instanceId} | Get a specific instance by ID |

## Data Model

- ServiceInstance: id (UUID), serviceName (String), host (String), port (Integer), status (UP|DOWN|UNKNOWN), metadata (JSON), lastHeartbeat (Instant), createdAt (Instant)
- ServiceHealth: instanceId (UUID), status (String), lastCheckedAt (Instant), responseTimeMs (Long)
- EvictionPolicy: heartbeatsRequired (Integer), evictionIntervalMs (Long), selfPreservationEnabled (Boolean)
