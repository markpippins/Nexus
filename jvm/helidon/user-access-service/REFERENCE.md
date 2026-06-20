# User Access Service — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `server.port` | 9093 | Service port |
| `access.token.expiration-ms` | 3600000 | Access token TTL (1 hour) |
| `access.token.refresh-ms` | 604800000 | Refresh token TTL (7 days) |
| `access.password.bcrypt-strength` | 12 | bcrypt cost factor |
| `mp.openapi.scan-dependencies` | true | Enable OpenAPI scanning |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ACCESS_TOKEN_SECRET` | — | Token signing secret (required) |
| `ACCESS_TOKEN_EXPIRY_MS` | 3600000 | Access token TTL |
| `BCRYPT_STRENGTH` | 12 | bcrypt cost factor |
| `HELidon_PORT` | 9093 | Service port |
| `SERVICE_REGISTRY_URL` | http://localhost:8085 | Service registry endpoint |

## Commands

| Command | Description |
|---------|-------------|
| `mvn package -Phelidon` | Build the Helidon MP application |
| `java -jar target/user-access-service.jar` | Run the service |
| `mvn test` | Run unit and integration tests |
| `docker build -t user-access-service .` | Build Docker image |

## Troubleshooting

- **Java 17 required**: This service overrides Java to version 17 for Helidon MP compatibility — ensure JDK 17 is installed
- **Token validation failures**: Verify ACCESS_TOKEN_SECRET matches across all services that validate tokens
- **Service not registering**: Ensure the service registry URL is correct and reachable
- **Helidon startup slow**: First startup may download dependencies — use `mvn package` to pre-build
