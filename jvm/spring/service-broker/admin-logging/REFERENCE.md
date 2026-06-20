# Admin Logging — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `logging.level.root` | INFO | Root log level |
| `logging.service.retention-days` | 90 | Log retention period in days |
| `logging.service.batch-size` | 1000 | Maximum log events per batch ingest |
| `server.port` | TBD | Service port (inherited from parent) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | INFO | Application log level (DEBUG, INFO, WARN, ERROR) |
| `LOG_RETENTION_DAYS` | 90 | Number of days to retain logs |
| `SPRING_PROFILES_ACTIVE` | dev | Active Spring profile |
| `DB_URL` | — | PostgreSQL connection URL |

## Commands

| Command | Description |
|---------|-------------|
| `./mvnw spring-boot:run` | Start the service locally |
| `./mvnw clean package` | Build the executable JAR |
| `./mvnw test` | Run unit and integration tests |
| `docker build -t admin-logging .` | Build Docker image |

## Troubleshooting

- **Logs not appearing**: Check that the broker gateway is reachable and the log level is set correctly
- **High memory usage**: Reduce `batch-size` or increase `retention-days` to trigger earlier archival
- **Connection refused**: Verify the service registry and broker gateway are running on the expected ports
