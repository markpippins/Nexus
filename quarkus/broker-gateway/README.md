# Quarkus-based Broker Gateway Service

## Overview
The `quarkus-broker-gateway` is a Quarkus-based implementation of the broker gateway service that complements the existing Spring Boot broker-gateway. It provides the same core functionality but leveraging the Quarkus framework for potentially improved performance, lower memory consumption, and native compilation support.

## Technology Stack
- **Framework**: Quarkus 3.15.1
- **Runtime**: Java 21
- **REST Framework**: RESTEasy Reactive
- **Serialization**: Jackson for JSON processing
- **Configuration**: SmallRye Config
- **Service Discovery**: REST Client for inter-service communication
- **Packaging**: Standard JAR with Quarkus plugin

## Architecture
This service mirrors the existing broker-gateway functionality:
- Request routing and dispatching
- Service orchestration
- Health monitoring
- External service communication
- Integration with the existing Nexus platform architecture

## Configuration

### application.properties
The service is configured through `src/main/resources/application.properties`:

```properties
# Server configuration
quarkus.http.port=8090
quarkus.application.name=quarkus-broker-gateway

# Logging
quarkus.log.level=INFO
quarkus.log.category."com.angrysurfer.nexus".level=DEBUG

# REST Client configuration (for calling other services)
quarkus.rest-client.prod-api.url=http://localhost:8080

# External services configuration
external.services.urls.user-service=http://localhost:8083
external.services.urls.login-service=http://localhost:8082
external.services.urls.file-service=http://localhost:8081
external.services.urls.search-service=http://localhost:8084

# External API client configuration
quarkus.rest-client.external-api.url=http://localhost:8080
```

### Environment Variables (Optional)
The service can also be configured using environment variables that override properties:
- `QUARKUS_HTTP_PORT` - Override the HTTP port
- `EXTERNAL_SERVICES_URLS_USER_SERVICE` - Override user-service URL
- `EXTERNAL_SERVICES_URLS_LOGIN_SERVICE` - Override login-service URL
- `EXTERNAL_SERVICES_URLS_FILE_SERVICE` - Override file-service URL
- `EXTERNAL_SERVICES_URLS_SEARCH_SERVICE` - Override search-service URL

## API Endpoints

### Routing
- **POST** `/api/route/{service}/{operation}`
  - Route requests to specific services with operations
  - Expects a JSON payload in the body
  - Example: `POST /api/route/user-service/create-user` with user data in body

### Health Check
- **GET** `/api/health`
  - Returns service health status
  - Example response: `{"status":"UP", "service":"quarkus-broker-gateway", "port":"8090"}`

### Service Listing
- **GET** `/api/services`
  - Lists available services
  - Example response: `"Available services: user-service, file-service, login-service, search-service"`

## Starting the Service

### Development Mode
```bash
cd /home/codex/dev/WORK/nexus/quarkus/broker-gateway
./mvnw compile quarkus:dev
```

### Production Mode
```bash
cd /home/codex/dev/WORK/nexus/quarkus/broker-gateway
./mvnw package
java -jar target/quarkus-broker-gateway-1.0.0-SNAPSHOT-runner.jar
```

### Docker Deployment
The service can be containerized with the standard Quarkus containerization extensions.

## Stopping the Service

### Development Mode
- Press `Ctrl+C` in the terminal where the service is running

### Production Mode
- Kill the Java process with appropriate signals:
```bash
# Find the process ID
ps aux | grep quarkus-broker-gateway

# Stop the service
kill -TERM <PID>
```

### Docker
```bash
# Stop container
docker stop <container-name>

# Or if using docker-compose
docker-compose down quarkus-broker-gateway
```

## Interacting with the Service

### API Requests
The service exposes the same API contracts as the original broker-gateway:

```bash
# Health check
curl http://localhost:8090/api/health

# Route a request to user-service
curl -X POST http://localhost:8090/api/route/user-service/get-user \
  -H "Content-Type: application/json" \
  -d '{"userId": "123"}'

# List available services
curl http://localhost:8090/api/services
```

### Configuration Updates
Configuration can be updated through:
1. Modifying `application.properties`
2. Setting environment variables
3. Using system properties when starting: `java -Dquarkus.http.port=9090 -jar ...`

## Integration with Nexus Platform

The Quarkus broker-gateway service is designed to work seamlessly with the existing Nexus platform:
- Compatible with existing client applications
- Same API contracts and endpoints as the Spring Boot version
- Can coexist with the Spring Boot broker-gateway (different ports)
- Follows the same security patterns and authentication flows
- Uses the same external service URLs for routing

### Host-Server Registration

The Quarkus broker-gateway **automatically registers** with the service-registry on startup, demonstrating **polyglot service registration** (Quarkus → Spring Boot).

**Configuration**:
```properties
# Service Registry Registration
service.registry.url=http://localhost:8085
service.host=localhost
registration.enabled=true
heartbeat.interval.seconds=30
```

**Features**:
- Auto-registration on startup
- Periodic heartbeats (every 30 seconds)
- Graceful shutdown handling
- Metadata includes framework info (Quarkus, native-capable)

**Verification**:
```bash
# Check registration
curl http://localhost:8085/api/registry/services

# Should show quarkus-broker-gateway with status ACTIVE
```

This demonstrates that **any JVM framework** (Spring Boot, Quarkus, Micronaut, etc.) can participate in the service mesh.

## Advantages of Quarkus Implementation

### Performance
- Faster startup times compared to Spring Boot
- Lower memory footprint
- Better resource utilization

### Features
- Reactive programming model
- Built-in health checks
- Configuration hot-reload in development
- Kubernetes-native approach

### Native Compilation
- Ability to compile to native executables for even faster startup and lower memory usage
- Optimized for cloud environments and containers

## Development Notes

### Adding New Services
To add new service URLs to the configuration, update the application.properties file:
```
external.services.urls.new-service=http://localhost:XXXX
```

The service will automatically pick up the new configuration without restart in development mode.

### Testing
Run the unit tests with:
```bash
./mvnw test
```

### Debugging
To enable debug mode, start with development mode flag:
```bash
./mvnw quarkus:dev -Ddebug
```

## Troubleshooting

### Common Issues
- **Port Already in Use**: Ensure port 8090 is available or change the configuration
- **Service URLs Invalid**: Verify all external service URLs in configuration are accessible
- **Health Checks Failing**: Check connectivity to configured external services

### Logging
Enable DEBUG level logging for troubleshooting:
```
quarkus.log.level=DEBUG
quarkus.log.category."com.angrysurfer.nexus".level=DEBUG
```
