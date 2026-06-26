# Broker Discovery Service — Specification

## Functional Requirements

- Maintain a registry of available service instances with health status
- Support service registration and deregistration at runtime
- Provide service lookup by name for client-side load balancing
- Broadcast heartbeat-based health checks to detect unhealthy instances

## Non-Functional Requirements

- Registration propagation within 5 seconds
- Availability: 99.99% uptime (critical infrastructure)
- Support 500+ concurrently registered service instances

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/discovery/register | Register a service instance |
| POST | /api/discovery/renew | Renew service instance lease (heartbeat) |
| DELETE | /api/discovery/{instanceId} | Deregister a service instance |
| GET | /api/discovery/services | List all registered services |
| GET | /api/discovery/services/{name} | Get instances for a specific service |

## Data Model

- ServiceInstance: id, serviceName, host, port, status, metadata (JSON), lastHeartbeat, createdAt
- ServiceHealth: instanceId, status, lastCheckedAt, responseTimeMs
