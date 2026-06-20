# Broker Gateway — Specification

## Functional Requirements

- Route incoming API requests to the appropriate backend service
- Enforce authentication and authorization for protected endpoints
- Aggregate responses from multiple downstream services
- Apply rate limiting per client and per endpoint

## Non-Functional Requirements

- Throughput: 5,000+ requests per second
- P99 latency: under 50ms (excluding downstream service time)
- Graceful degradation: circuit-breaker pattern for failing downstream services

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| ANY | /api/users/** | Route to User Service |
| ANY | /api/files/** | Route to File Service |
| ANY | /api/notes/** | Route to Note Service |
| ANY | /api/search/** | Route to Search Service |
| ANY | /api/login/** | Route to Login Service |
| ANY | /api/uploads/** | Route to Upload Service |
| ANY | /admin/** | Route to Admin Logging |
| ANY | /api/discovery/** | Route to Discovery Service |

## Data Model

- RouteRule: id, path, targetService, method, rateLimit, authRequired
- RateLimitPolicy: clientId, endpoint, maxRequests, windowSeconds
