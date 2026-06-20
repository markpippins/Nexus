# Service Broker — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `broker.gateway.url` | http://localhost:8080 | Broker gateway URL |
| `broker.registry.url` | http://localhost:8085 | Service registry URL |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BROKER_GATEWAY_URL` | http://localhost:8080 | Gateway URL |
| `BROKER_REGISTRY_URL` | http://localhost:8085 | Registry URL |

## Commands

| Command | Description |
|---------|-------------|
| `mvn clean install` | Build and install the library |
| `mvn test` | Run unit tests |
| `mvn javadoc:javadoc` | Generate JavaDoc |

## Troubleshooting

- **Library not resolving**: Run `mvn install` to install the library to the local Maven repository before dependent projects can use it
- **Gateway connection refused**: Verify BROKER_GATEWAY_URL points to a running broker gateway instance
- **Serialization errors**: Ensure request/response POJOs have proper Jackson annotations for JSON serialization
