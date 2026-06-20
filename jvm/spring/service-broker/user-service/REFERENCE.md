# User Service — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `server.port` | TBD | Service port (inherited from parent) |
| `user.password.bcrypt-strength` | 12 | bcrypt cost factor for password hashing |
| `user.pagination.max-page-size` | 100 | Maximum items per page |
| `user.session.max-active` | 10 | Maximum active sessions per user |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `USER_BCRYPT_STRENGTH` | 12 | bcrypt cost factor |
| `SPRING_PROFILES_ACTIVE` | dev | Active Spring profile |
| `DB_URL` | — | PostgreSQL connection URL |

## Commands

| Command | Description |
|---------|-------------|
| `./mvnw spring-boot:run` | Start the service locally |
| `./mvnw clean package` | Build the executable JAR |
| `./mvnw test` | Run unit and integration tests |
| `curl http://localhost:{port}/api/users` | List all users |

## Troubleshooting

- **User creation fails with duplicate email**: Email addresses must be unique — use a different email or check if the user already exists
- **Password validation error**: Ensure passwords meet the minimum complexity requirements (configurable in security policy)
- **Role assignment not reflected**: User roles may be cached — allow up to 5 minutes for cache invalidation or clear the cache manually
- **Soft-deleted user still visible**: Check that queries are filtering by `status != 'DEACTIVATED'` unless explicitly requested
- **bcrypt performance**: Increasing `bcrypt-strength` improves security but increases authentication latency — balance based on your threat model
