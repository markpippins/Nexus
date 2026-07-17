# User Access Service

A core module of the Nexus platform providing user management capabilities. Handles registration, authentication, profile management, and related user operations using PostgreSQL for persistence through the `assembly` schema.

## Architecture

The service follows a standard layered Spring Boot architecture with JPA persistence:

```
Controller → Service → Repository → PostgreSQL (assembly.users)
```

- **UserRegistrationController**: Exposes a `/user/validate` REST endpoint
- **UserAccessService**: Handles core business logic for credential validation
- **UserRegistrationRepository**: Spring Data JPA repository for the `assembly.users` table
- **UserRegistration**: JPA entity mapped to `assembly.users`

## Dual ID System

The service uses a single UUID primary key system. UUIDs are generated at the database level via PostgreSQL's `gen_random_uuid()`. This replaces the legacy dual-ID pattern (Long + MongoDB String ID).

## API Capabilities

- **Authentication:** Login via alias/password validation (`POST /user/validate`)
- **User Lifecycle:** Registration, update, and deletion (via broker operations)
- **Lookup:** Find by ID, alias, or email

## Integration

- **Login Service:** Consumes user credentials for authentication
- **Broker Service:** All operations are exposed through the broker-gateway
- **User API:** Shared DTOs (e.g., `UserRegistrationDTO`) are defined in the `nexus-user-api` module

## Security

- Password hashing via bcrypt (cost factor 12)
- Rate limiting on login attempts
- XSS prevention on input fields
- Audit logging for all account changes

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/nexus` | PostgreSQL JDBC URL |
| `SPRING_DATASOURCE_USERNAME` | `pguser` | Database user |
| `SPRING_DATASOURCE_PASSWORD` | `pgpass` | Database password |
| `SPRING_PROFILES_ACTIVE` | `dev` | Active Spring profile |

## Running with PostgreSQL

The service uses PostgreSQL via the `assembly` schema. Ensure PostgreSQL is running and the assembly schema exists:

```sql
CREATE SCHEMA IF NOT EXISTS assembly;
```

The `users` table will be validated against the entity on startup (ddl-auto=validate).

## Data Management

- **User Data Storage:** Secure PostgreSQL document storage in the `assembly` schema
- **UUID-based Identification:** All primary keys use PostgreSQL `gen_random_uuid()` for distributed-friendly ID generation
