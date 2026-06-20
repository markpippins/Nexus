# Broker Service — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `broker.service.timeout` | 5000 | Default service invocation timeout (ms) |
| `broker.service.retry.count` | 3 | Max retry attempts for failed invocations |
| `broker.service.discovery.cache-ttl` | 60000 | Service discovery cache TTL (ms) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BROKER_SERVICE_TIMEOUT` | 5000 | Service timeout in ms |
| `BROKER_RETRY_COUNT` | 3 | Max retry attempts |

## Commands

| Command | Description |
|---------|-------------|
| `mvn spring-boot:run` | Start the broker service |
| `mvn clean package` | Build the JAR |
| `mvn test` | Run unit and integration tests |

## Troubleshooting

- **Service not found**: Verify the target service is registered and the operation name is correct
- **Request timeout**: Increase BROKER_SERVICE_TIMEOUT or check if the downstream service is healthy
- **Retries exhausted**: All retry attempts failed — check downstream service availability and logs
- **Validation errors**: The request failed validation — check the error response for specific field errors
