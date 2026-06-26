# Broker Gateway — Specification

## Functional Requirements

- Route incoming API requests to the appropriate backend service
- Enforce authentication and authorization for protected endpoints
- Aggregate responses from multiple downstream services
- Apply rate limiting per client and per endpoint
- Load balance across multiple instances of downstream services

## Non-Functional Requirements

- Throughput: 5,000+ requests per second
- P99 latency: under 50ms (excluding downstream)
- Circuit breaker: fail fast when downstream services are unavailable
- Quarkus native compilation for fast startup and low memory footprint

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| ANY | /api/users/** | Route to User Access Service |
| ANY | /api/files/** | Route to File Service |
| ANY | /api/notes/** | Route to Note Service |
| ANY | /api/search/** | Route to Search Service |
| ANY | /api/login/** | Route to Login Service |
| ANY | /api/uploads/** | Route to Upload Service |
| ANY | /api/access/** | Route to User Access Service |
| GET | /q/health | Quarkus health check |
| GET | /q/metrics | Quarkus metrics endpoint |

## Data Model

- RouteRule: id (UUID), path (String), targetService (String), method (String), rateLimit (Integer), authRequired (Boolean)
- CircuitBreakerState: serviceName (String), state (CLOSED|OPEN|HALF_OPEN), failureCount (Integer), lastFailureAt (Instant)
