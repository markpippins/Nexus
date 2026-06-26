# Broker Gateway — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `quarkus.http.port` | 8090 | Service port |
| `quarkus.http.cors` | true | Enable CORS |
| `gateway.rate-limit.max-requests` | 100 | Max requests per window per client |
| `gateway.rate-limit.window-seconds` | 60 | Rate limit window duration |
| `gateway.circuit-breaker.threshold` | 5 | Failure count before circuit opens |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `QUARKUS_HTTP_PORT` | 8090 | Service port |
| `SERVICE_REGISTRY_URL` | http://localhost:8085 | Service registry endpoint |
| `RATE_LIMIT_MAX` | 100 | Max requests per window |
| `CIRCUIT_BREAKER_THRESHOLD` | 5 | Failure threshold for circuit breaker |

## Commands

| Command | Description |
|---------|-------------|
| `./mvnw compile quarkus:dev` | Run in development mode with live reload |
| `./mvnw clean package -Dquarkus.package.type=uber-jar` | Build fat JAR |
| `./mvnw clean package -Dquarkus.package.type=native` | Build native executable (requires GraalVM) |
| `./target/broker-gateway-runner` | Run native binary |
| `curl http://localhost:8090/q/health` | Health check |

## Troubleshooting

- **Native image build fails**: Ensure GraalVM 21+ is installed and `GRAALVM_HOME` is set
- **Circuit breaker open**: Check downstream services are healthy — the circuit resets automatically after the timeout
- **Routes not matching**: Path patterns are evaluated in order — more specific routes should come first
- **High memory in dev mode**: Quarkus dev mode uses more memory — use the uber-jar for production-like testing
