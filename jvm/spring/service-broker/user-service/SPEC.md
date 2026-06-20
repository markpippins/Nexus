# User Service — Specification

## Functional Requirements

- CRUD operations for user accounts (create, read, update, delete)
- Manage user roles and permissions with RBAC
- Support organization/tenant membership for multi-tenancy
- Provide user lookup by email, username, or ID
- Handle account lifecycle (active, suspended, deactivated)

## Non-Functional Requirements

- P99 read latency under 50ms for individual user lookups
- Password hashing with bcrypt (cost factor 12)
- Email uniqueness enforced at the database level

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/users | Create a new user |
| GET | /api/users/{userId} | Get user by ID |
| GET | /api/users | List users with pagination and filters |
| PUT | /api/users/{userId} | Update user profile |
| DELETE | /api/users/{userId} | Soft-delete (deactivate) a user |
| PATCH | /api/users/{userId}/roles | Update user roles |
| GET | /api/users/{userId}/permissions | Get effective permissions for a user |

## Data Model

- User: id (UUID), username (String), email (String), passwordHash (String), displayName (String), avatarUrl (String), status (ACTIVE|SUSPENDED|DEACTIVATED), tenantId (UUID), createdAt, updatedAt
- Role: id (UUID), name (String), description (String), permissions (String[])
- UserRole: userId (UUID), roleId (UUID), assignedAt
- Tenant: id (UUID), name (String), domain (String), settings (JSON), createdAt
