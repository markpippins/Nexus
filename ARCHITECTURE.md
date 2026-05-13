# Development Commands

### Building and Running Services

- **Docker Compose (Recommended)**: `docker-compose up --build` - Starts all services
- **Java Services**: Use Maven - `mvn clean install` in respective service directories
- **Node.js Services**: `npm install` followed by `npm start` or `npm run dev`
- **Python Services**: `pip install -r requirements.txt` then `python app.py` or equivalent
- **Go Services**: `go build` then execute the binary
- **Helidon Services**: `mvn package` then `java -jar target/*.jar`

### Testing

- **Java Unit Tests**: `mvn test` (CI workflow uses `-DskipTests=false`)
- **Individual Test Files**: `mvn -Dtest=TestClassName test`
- **Integration Tests**: Varies by service - check for test directories and scripts

### Service Management

- **Registry Service**: Runs on port 8085 (service registry)
- **Broker Gateway**: Runs on port 8081 (request routing)
- **Broker Gateway Proxy**: Runs on port 8080 (reverse proxy)
- **Service Mesh UI**: Access via browser for service visualization

### Common Directories

- **Java Services**: `java/spring/service-broker/`, `java/spring/service-registry/`, `java/shared/`
- **Node.js Services**: `typescript/`, `legacy/web/` subdirectories
- **Python Services**: `python/` directory
- **Go Services**: `legacy/go/` and `go/` directories
- **Docker Configs**: Look for `docker-compose.yml` and `Dockerfile` files in service directories

## Architecture Overview

### Three-Layer Service Mesh

1. **Registry Service (Port 8085)**: Central service registry and management
   - Service registration via `/api/registry/register`
   - Framework management (Spring Boot, Quarkus, Helidon, Node.js, Go, Python)
   - Operation-based service discovery
   - Persistent storage (MySQL/H2 fallback)

2. **Broker Gateway (Port 8081)**: Request routing and orchestration
   - ServiceRequest/ServiceResponse protocol
   - Automatic service discovery and routing
   - Load balancing and circuit breaker patterns
   - Health check aggregation

3. **Broker Gateway Proxy (Port 8080)**: Public-facing reverse proxy (AdonisJS)
   - Rate limiting and request logging
   - Auto-registration with host-server
   - Heartbeat mechanism (30-second intervals)
   - Request context headers for tracing

### Key Features

- **Polyglot Support**: Java (Spring Boot 3.5.0, Quarkus 3.15.1, Helidon MP), Node.js (Express, NestJS, AdonisJS, Moleculer), Python (FastAPI, Django, Flask), Go (standard library, Gin)
- **Service Mesh UI**: Real-time visualization, dependency graphs, service operations
- **External Service Integration**: Proxy with fallback mechanisms
- **Deployment**: Docker Compose recommended for local development

### Service Discovery Flow

1. Service registers with Registry Service (`/api/registry/register`)
2. Client requests hit Broker Gateway Proxy (port 8080)
3. Proxy forwards to Broker Gateway (port 8081) for service lookup
4. Broker Gateway queries Registry Service for service instances
5. Request routed to target service
6. Response flows back through the chain
7. Continuous health monitoring via heartbeats

## Important Files

- **docker-compose.yml**: Main deployment configuration (check service-specific directories)
- **java/pom.xml**: Root Maven configuration for Java services
- **.github/workflows/ci.yml**: CI pipeline for Java builds
- **README.md**: Detailed platform overview and evolution

## Notes

- Services communicate via REST/HTTP with JSON payloads
- Each service typically has its own configuration (application.yml, .env, etc.)
- Look for service-specific startup scripts in service directories
- The platform emphasizes loose coupling through broker-based communication
