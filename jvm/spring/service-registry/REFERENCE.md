# Service Registry — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `server.port` | 8085 | Service port |
| `eureka.server.eviction-interval-timer-ms` | 5000 | Interval for evicting stale instances (ms) |
| `eureka.server.renewal-percent-threshold` | 0.85 | Minimum renewal percentage before self-preservation |
| `eureka.server.enable-self-preservation` | true | Enable self-preservation mode |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REGISTRY_PORT` | 8085 | Service port |
| `EUREKA_SELF_PRESERVATION` | true | Enable self-preservation |
| `EUREKA_EVICTION_INTERVAL_MS` | 5000 | Eviction check interval |
| `SPRING_PROFILES_ACTIVE` | dev | Active Spring profile |

## Commands

| Command | Description |
|---------|-------------|
| `./mvnw spring-boot:run` | Start the service locally |
| `./mvnw clean package` | Build the executable JAR |
| `./mvnw test` | Run unit and integration tests |
| `curl http://localhost:8085/eureka/apps` | List all registered applications |
| `docker build -t service-registry .` | Build Docker image |

## Troubleshooting

- **Self-preservation mode**: During network partitions, the registry stops evicting instances — this is expected behavior. Restore network connectivity and the registry will resume normal operation.
- **Services not visible**: Check that clients are configured with the correct registry URL and that heartbeats are being sent
- **Duplicate instances**: Verify that instance IDs are unique — each instance should use a unique ID on startup
- **Registry not available**: As a critical infrastructure service, ensure the registry starts before all dependent services
