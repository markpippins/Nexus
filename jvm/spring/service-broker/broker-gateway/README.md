# Broker Gateway

API gateway that routes requests to various microservices (user, file system, login, etc.)

## Quick Start

### Build
```bash
cd spring
mvn clean install -DskipTests
```

### Run

#### On Selenium Machine
```bash
cd spring/broker-gateway
./start-selenium.sh
```
Or:
```bash
java -jar target/broker-gateway-1.0.0-SNAPSHOT.jar --spring.profiles.active=selenium
```

#### On Beryllium Machine
```bash
cd spring/broker-gateway
./start-beryllium.sh
```
Or:
```bash
java -jar target/broker-gateway-1.0.0-SNAPSHOT.jar --spring.profiles.active=beryllium
```

#### Local Development
```bash
cd spring/broker-gateway
./start-dev.sh
```
Or:
```bash
java -jar target/broker-gateway-1.0.0-SNAPSHOT.jar --spring.profiles.active=dev
```

## Profiles

- **selenium** (default): Runs on Selenium, connects to FS server on Beryllium (172.16.30.57:4040)
- **beryllium**: Runs on Beryllium, connects to local FS server (localhost:4040)
- **dev**: Local development with debug logging

See `docs/spring-profiles-guide.md` for detailed profile documentation.

## Health Check

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "UP",
  "service": "broker-gateway",
  "timestamp": "2024-11-07T...",
  "details": {...}
}
```

## API Endpoints

### Broker Request
```bash
POST http://localhost:8080/api/broker/submitRequest
Content-Type: application/json

{
  "service": "loginService",
  "operation": "login",
  "requestId": "unique-id",
  "params": {
    "alias": "username",
    "identifier": "password"
  }
}
```

## Configuration

Configuration files are in `src/main/resources/`:
- `application.properties` - Common config
- `application-selenium.properties` - Selenium-specific
- `application-beryllium.properties` - Beryllium-specific
- `application-dev.properties` - Development-specific

## Dependencies

- MongoDB (localhost:27017)
- File System Server (port 4040)
- User Service (embedded)
- Login Service (embedded)

## Troubleshooting

### CORS Issues
See `docs/cors-troubleshooting.md`

### Profile Not Loading
Check startup logs for: `The following 1 profile is active: "beryllium"`

### Connection Refused
- Verify MongoDB is running: `mongosh`
- Verify FS server is running: `curl http://localhost:4040/health`

## Documentation

- [Spring Profiles Guide](../../docs/spring-profiles-guide.md)
- [CORS Troubleshooting](../../docs/cors-troubleshooting.md)
- [Health Checks](../../docs/health-checks.md)
- [Angular Nexus Setup](../../docs/nexus-setup.md)
