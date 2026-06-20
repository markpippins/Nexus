# Broker Gateway Proxy — Specification

## Functional Requirements

- Provide a public-facing reverse proxy in front of the Spring Broker Gateway
- Forward all non-health requests to the upstream broker-gateway transparently
- Register with the service registry on startup with periodic heartbeats
- Deregister gracefully on application shutdown
- Add request context headers (X-Forwarded-For, X-Real-IP, X-Forwarded-By)
- Return upstream errors in the standard ServiceResponse JSON format

## Non-Functional Requirements

- Transparent proxying: method, query params, body, and headers preserved
- Heartbeat interval: 30 seconds
- CORS-ready for browser-based clients
- Upstream timeout: configurable per-route

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check endpoint |
| ANY | /* | Proxy all other requests to broker-gateway at port 8081 |

## Data Model

- ProxyLogEntry: method (String), path (String), statusCode (Integer), durationMs (Long), clientIp (String), timestamp (Instant)
- RegistryRegistration: serviceName (String), host (String), port (Integer), healthCheck (String), heartbeatIntervalMs (Integer)
