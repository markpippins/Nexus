# Broker Gateway — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `server.port` | 8081 | Gateway service port |
| `spring.cloud.gateway.routes` | — | Route definitions (see API docs) |
| `gateway.rate-limit.enabled` | true | Enable rate limiting |
| `gateway.rate-limit.max-requests` | 100 | Max requests per window per client |
| `gateway.rate-limit.window-seconds` | 60 | Rate limit window duration |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT` | 8081 | Gateway service port |
| `SERVICE_REGISTRY_URL` | http://localhost:8085 | Service registry endpoint |
| `SPRING_PROFILES_ACTIVE` | dev | Active Spring profile |
| `JWT_SECRET` | — | Secret key for JWT validation |

## Commands

| Command | Description |
|---------|-------------|
| `./mvnw spring-boot:run` | Start the gateway locally |
| `./mvnw clean package` | Build the executable JAR |
| `./mvnw test` | Run unit and integration tests |
| `curl http://localhost:8081/api/health` | Health check endpoint |

## Troubleshooting

- **503 Service Unavailable**: The downstream service may be down or not registered in the discovery service
- **Rate limit exceeded**: Check `gateway.rate-limit.max-requests` and verify no client is abusing the API
- **Authentication failures**: Verify `JWT_SECRET` is set correctly and matches the login service
- **Routes not matching**: Check route path patterns in the gateway configuration — paths are evaluated in order
