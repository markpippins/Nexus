# User Access Service — Specification

## Functional Requirements

- Authenticate and authorize user access to broker services
- Manage user roles and permissions with RBAC
- Provide token validation endpoint for downstream services
- Support multi-tenancy with organization-scoped access control
- Handle session management and token refresh

## Non-Functional Requirements

- Authentication latency under 200ms P99
- Token validation throughput: 5,000+ requests per second
- Password hashing with bcrypt (cost factor 12)
- Helidon MP reactive execution for non-blocking I/O

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/access/authenticate | Authenticate user credentials |
| GET | /api/access/validate | Validate access token |
| POST | /api/access/refresh | Refresh expired token |
| GET | /api/access/users/{userId}/permissions | Get effective permissions for a user |
| POST | /api/access/users/{userId}/roles | Assign roles to a user |

## Data Model

- AccessToken: id (UUID), userId (UUID), tenantId (UUID), roles (String[]), issuedAt (Instant), expiresAt (Instant)
- UserPermission: userId (UUID), resource (String), action (String), granted (Boolean)
- Role: id (UUID), name (String), description (String), permissions (String[])
- Session: id (UUID), userId (UUID), tenantId (UUID), ipAddress, createdAt, expiresAt
