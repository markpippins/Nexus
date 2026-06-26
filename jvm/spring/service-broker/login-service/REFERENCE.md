# Login Service — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `server.port` | TBD | Service port (inherited from parent) |
| `jwt.secret` | — | JWT signing secret (must be 256+ bits) |
| `jwt.access-token-expiration-ms` | 3600000 | Access token expiry (1 hour) |
| `jwt.refresh-token-expiration-ms` | 604800000 | Refresh token expiry (7 days) |
| `login.rate-limit.max-attempts` | 5 | Max failed login attempts per window |
| `login.rate-limit.window-minutes` | 1 | Rate limit window duration |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | — | JWT signing secret (required) |
| `JWT_ACCESS_EXPIRY_MS` | 3600000 | Access token TTL in milliseconds |
| `JWT_REFRESH_EXPIRY_MS` | 604800000 | Refresh token TTL in milliseconds |
| `SPRING_PROFILES_ACTIVE` | dev | Active Spring profile |

## Commands

| Command | Description |
|---------|-------------|
| `./mvnw spring-boot:run` | Start the service locally |
| `./mvnw clean package` | Build the executable JAR |
| `./mvnw test` | Run unit and integration tests |
| `curl -X POST -d '{"username":"admin","password":"pass"}' http://localhost:{port}/api/login/authenticate` | Test authentication |

## Troubleshooting

- **Invalid token**: The JWT may be expired — check `jwt.access-token-expiration-ms` and refresh with the refresh token
- **JWT signature mismatch**: Verify `JWT_SECRET` is the same across all services that validate tokens
- **Rate limited**: Wait for the rate limit window to expire or increase `login.rate-limit.max-attempts`
- **Token not accepted downstream**: Ensure the introspection endpoint (`/api/login/validate`) is reachable from downstream services
