# Broker Discovery Service — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `server.port` | TBD | Service port (inherited from parent) |
| `eureka.server.eviction-interval-timer-ms` | 5000 | Interval for evicting stale instances (ms) |
| `eureka.server.renewal-percent-threshold` | 0.85 | Minimum renewal percentage before self-preservation |
| `eureka.server.enable-self-preservation` | true | Enable self-preservation mode |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EUREKA_PORT` | — | Eureka server port |
| `SPRING_PROFILES_ACTIVE` | dev | Active Spring profile |
| `DB_URL` | — | PostgreSQL connection URL |

## Commands

| Command | Description |
|---------|-------------|
| `./mvnw spring-boot:run` | Start the service locally |
| `./mvnw clean package` | Build the executable JAR |
| `./mvnw test` | Run unit and integration tests |
| `docker build -t broker-discovery-service .` | Build Docker image |

## Troubleshooting

- **Services not registering**: Verify network connectivity and that the service registry URL is correct in the client configuration
- **Self-preservation mode**: During network partitions, the registry may enter self-preservation — allow time for recovery or increase `renewal-percent-threshold`
- **Stale instances**: Increase `eviction-interval-timer-ms` or verify that clients are sending heartbeats at the expected interval
