# Login Service — Specification

## Functional Requirements

- Authenticate users with username/password credentials
- Issue JWT tokens upon successful authentication
- Support token refresh with refresh tokens
- Validate tokens for downstream services (introspection endpoint)
- Support multi-tenancy (organization-scoped authentication)

## Non-Functional Requirements

- Authentication latency under 200ms P99
- Token expiry configurable per tenant (default: 1 hour)
- Failed login attempt rate limiting: 5 attempts per minute per user

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/login/authenticate | Authenticate and return JWT |
| POST | /api/login/refresh | Refresh an expired token |
| POST | /api/login/validate | Validate a token (for downstream services) |
| POST | /api/login/logout | Invalidate a refresh token |
| GET | /api/login/sessions | List active sessions for a user (admin) |

## Data Model

- LoginRequest: username (String), password (String), tenantId (UUID)
- TokenResponse: accessToken (String), refreshToken (String), expiresIn (Long)
- TokenClaims: userId (UUID), tenantId (UUID), roles (String[]), issuedAt (Instant), expiresAt (Instant)
- Session: id (UUID), userId (UUID), tenantId (UUID), ipAddress, createdAt, expiresAt
