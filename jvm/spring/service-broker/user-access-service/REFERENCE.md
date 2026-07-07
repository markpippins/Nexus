# User Access Service — Reference

## Configuration

| Property | Default | Description |
| :--- | :--- | :--- |
| `server.port` | TBD | Service port (inherited from parent) |
| `spring.datasource.url` | `jdbc:postgresql://localhost:5432/nexus` | PostgreSQL JDBC URL |
| `spring.datasource.username` | `pguser` | Database user |
| `spring.datasource.password` | `pgpass` | Database password |
| `spring.jpa.properties.hibernate.default_schema` | `assembly` | Default schema for JPA entities |
| `spring.jpa.hibernate.ddl-auto` | `validate` | Hibernate DDL mode (validate against existing schema) |
| `user.password.bcrypt-strength` | 12 | bcrypt cost factor |
| `user.rate-limit.max-attempts` | 5 | Max failed login attempts |

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/nexus` | PostgreSQL connection string |
| `SPRING_DATASOURCE_USERNAME` | `pguser` | Database user |
| `SPRING_DATASOURCE_PASSWORD` | `pgpass` | Database password |
| `SPRING_PROFILES_ACTIVE` | dev | Active Spring profile |
| `BCRYPT_STRENGTH` | 12 | bcrypt cost factor |

## Commands

| Command | Description |
| :--- | :--- |
| `./mvnw spring-boot:run` | Start the service |
| `./mvnw clean package` | Build the JAR |
| `./mvnw test` | Run tests |

## Troubleshooting Notes

- **PostgreSQL connection refused**: Ensure PostgreSQL is running on `localhost:5432`.
- **Schema not found**: Run `CREATE SCHEMA IF NOT EXISTS assembly;` in the nexus database.
- **UUID mismatch**: The system uses PostgreSQL UUID primary keys with `gen_random_uuid()` default. Ensure any manual inserts use `gen_random_uuid()` or a valid UUID.
- **Password validation**: Passwords must meet minimum complexity requirements; bcrypt hashes are stored for all passwords.
- **Rate limited**: Wait for the rate limit window to expire or increase `user.rate-limit.max-attempts`.
