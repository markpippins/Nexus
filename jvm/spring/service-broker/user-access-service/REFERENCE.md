# User Access Service — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `server.port` | TBD | Service port (inherited from parent) |
| `spring.data.mongodb.uri` | mongodb://localhost:27017/nexus | MongoDB connection URI |
| `user.password.bcrypt-strength` | 12 | bcrypt cost factor |
| `user.rate-limit.max-attempts` | 5 | Max failed login attempts |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | mongodb://localhost:27017/nexus | MongoDB connection string |
| `SPRING_PROFILES_ACTIVE` | dev | Active Spring profile |
| `BCRYPT_STRENGTH` | 12 | bcrypt cost factor |

## Commands

| Command | Description |
|---------|-------------|
| `./mvnw spring-boot:run` | Start the service |
| `./mvnw clean package` | Build the JAR |
| `./mvnw test` | Run tests |
| `docker start mongodb` | Start MongoDB (requires Docker) |

## Troubleshooting

- **MongoDB connection refused**: Ensure MongoDB is running — use `mongodb-docker-start.sh` or `docker start mongodb`
- **Dual ID mismatch**: The system uses both Long IDs (for web client compatibility) and String mongoIds — ensure the correct ID type is used in API calls
- **Password validation**: Ensure passwords meet minimum complexity requirements — bcrypt hashes are stored for all passwords
- **Rate limited**: Wait for the rate limit window to expire or increase user.rate-limit.max-attempts
