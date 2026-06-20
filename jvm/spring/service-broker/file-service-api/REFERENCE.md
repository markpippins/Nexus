# File Service API — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `server.port` | TBD | Service port (inherited from parent) |
| `springdoc.api-docs.enabled` | true | Enable OpenAPI documentation |
| `springdoc.swagger-ui.enabled` | true | Enable Swagger UI |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SPRING_PROFILES_ACTIVE` | dev | Active Spring profile |
| `API_BASE_PATH` | /api | Base path for API endpoints |

## Commands

| Command | Description |
|---------|-------------|
| `./mvnw clean compile` | Compile the API module |
| `./mvnw clean package` | Build the JAR (includes DTOs and client) |
| `./mvnw test` | Run unit tests |
| `./mvnw javadoc:javadoc` | Generate JavaDoc |

## Troubleshooting

- **DTO version mismatch**: Ensure the file-service-api version matches the file-service implementation version
- **OpenAPI spec not loading**: Verify `springdoc.api-docs.enabled` is true and navigate to `/v3/api-docs`
- **Compilation errors**: Check that all DTOs are properly annotated with Jackson annotations for serialization
