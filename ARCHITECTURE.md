# Architecture

## System Defaults

| Setting | Value | Notes |
|---------|-------|-------|
| java.version | 21 | Default for all JVM projects |
| spring-boot.version | 3.5.0 | Default Spring Boot version |
| quarkus.version | 3.15.1 | Default Quarkus version |
| helidon.version | 4.x | Default Helidon MP version |
| node.version | 20 | Default Node.js version |
| typescript.version | 5.x | Default TypeScript version |
| python.version | 3.13 | Default Python version |
| port.range.backend | 8080-8099 | Preferred range for backend services |
| port.range.frontend | 3000-3999 | Preferred range for frontend/UI dev servers |
| port.range.proxy | 3333-3349 | Preferred range for proxy services |

## Exceptions

| Project | Setting | Value | Reason |
|---------|---------|-------|--------|
| jvm/helidon/user-access-service | java.version | 17 | Helidon MP compatibility requirement |
| typescript/mock-broker-service | node.version | 18 | Legacy dependency |

## Scope

| Setting | Value |
|---------|-------|
| included_paths | `jvm/**`, `typescript/**` |
| excluded_paths | `jvm/shared/**`, `typescript/utils/**`, `typescript/broker-client/**` |
| enforcement | advisory |

> Enforcement mode: `advisory` = Inspector flags discrepancies only. `strict` = Planner creates remediation plans automatically. Expand scope incrementally as process matures.

## Service Topology

### Three-Layer Service Mesh

1. **Registry Service (Port 8085)**: Central service registry and management
   - Path: `jvm/spring/service-registry/`
   - Framework: Spring Boot
   - Service registration via `/api/registry/register`
   - Framework management (Spring Boot, Quarkus, Helidon, Node.js, Go, Python)
   - Operation-based service discovery
   - Persistent storage (MySQL/H2 fallback)
   - Redis for caching

2. **Broker Gateway (Port 8081 Spring / 8090 Quarkus)**: Request routing and orchestration
   - Spring: `jvm/spring/service-broker/broker-gateway/` (port 8081)
   - Quarkus: `jvm/quarkus/broker-gateway/` (port 8090)
   - ServiceRequest/ServiceResponse protocol
   - Automatic service discovery and routing
   - Load balancing and circuit breaker patterns
   - Health check aggregation

3. **Broker Gateway Proxy (Port 8079 AdonisJS / 3333 TypeScript)**: Public-facing reverse proxy
   - AdonisJS: `adonisjs/broker-gateway-proxy/` (port 8079)
   - TypeScript: `typescript/broker-gateway-proxy/` (port 3333)
   - TypeScript broker-service-proxy: `typescript/broker-service-proxy/` (port 3334)
   - Rate limiting and request logging
   - Auto-registration with host-server
   - Heartbeat mechanism (30-second intervals)
   - Request context headers for tracing

### Service Discovery Flow

1. Service registers with Registry Service (`/api/registry/register`, port 8085)
2. Client requests hit Broker Gateway Proxy (port 8079 AdonisJS or 3333 TypeScript)
3. Proxy forwards to Broker Gateway (port 8081 Spring or 8090 Quarkus) for service lookup
4. Broker Gateway queries Registry Service for service instances
5. Request routed to target service
6. Response flows back through the chain
7. Continuous health monitoring via heartbeats

### Backend Services

#### Java/JVM Services

| Service | Path | Framework | Port | Config Source |
|---------|------|-----------|------|---------------|
| Service Registry | `jvm/spring/service-registry/` | Spring Boot | 8085 | `application.properties` |
| Broker Gateway | `jvm/spring/service-broker/broker-gateway/` | Spring Boot | 8081 | `application.properties` |
| Broker Gateway | `jvm/quarkus/broker-gateway/` | Quarkus | 8090 | `application.properties` |
| **Topology Server** | `jvm/spring/topology-server/` | **Spring Boot** | **8084** | `application.properties` |
| User Access Service | `jvm/helidon/user-access-service/` | Helidon MP | 9093 | `application.yaml` |
| File Service | `jvm/spring/service-broker/file-service/` | Spring Boot | TBD | — |
| File Service API | `jvm/spring/service-broker/file-service-api/` | Spring Boot | TBD | — |
| Login Service | `jvm/spring/service-broker/login-service/` | Spring Boot | TBD | — |
| Search Service | `jvm/spring/service-broker/search-service/` | Spring Boot | TBD | — |
| User Service | `jvm/spring/service-broker/user-service/` | Spring Boot | TBD | — |
| Note Service | `jvm/spring/service-broker/note-service/` | Spring Boot | TBD | — |
| Upload Service | `jvm/spring/service-broker/upload-service/` | Spring Boot | TBD | — |
| Broker Discovery | `jvm/spring/service-broker/broker-discovery-service/` | Spring Boot | TBD | — |
| Admin Logging | `jvm/spring/service-broker/admin-logging/` | Spring Boot | TBD | — |

#### TypeScript Services

| Service | Path | Framework | Port | Config Source |
|---------|------|-----------|------|---------------|
| Broker Gateway Proxy | `typescript/broker-gateway-proxy/` | Express | 3333 | `.env.local` (`BROKER_PROXY_PORT`) |
| Broker Service Proxy | `typescript/broker-service-proxy/` | Express | 3334 | `.env.local` (`BROKER_PROXY_PORT`) |
| File System Server | `typescript/file-system-server/` | Express | 4040 | `.env.local` (`FS_SERVER_PORT`) |
| Google Search Proxy | `typescript/google/` | Node.js http | 8082 | `gapi-search-serv.ts` (`SEARCH_SERVER_PORT`) |
| Image Server | `typescript/image-server/` | Express | 9081 | `.env.local` (`IMAGE_SERVER_PORT`) |
| Mock Broker Service | `typescript/mock-broker-service/` | Express | 8099 | `server.js` |
| Unsplash Proxy | `typescript/unsplash/` | Node.js http | 8083 | `image-search.ts` (`UNSPLASH_SERVER_PORT`) |
| Broker Client | `typescript/broker-client/` | Library | N/A | No server |
| Utils | `typescript/utils/` | Library | N/A | No server |

#### Moleculer Services

| Service | Path | Framework | Port | Config Source |
|---------|------|-----------|------|---------------|
| Search Service | `moleculer/search/` | Moleculer + ApiGateway | 4050 | `services/api.service.ts` (`SERVICE_PORT`) |

#### AdonisJS Services

| Service | Path | Framework | Port | Config Source |
|---------|------|-----------|------|---------------|
| Broker Gateway Proxy | `adonisjs/broker-gateway-proxy/` | AdonisJS | 8079 | `.env` (`PORT`) |

#### Python Services

| Service | Path | Framework | Port | Config Source |
|---------|------|-----------|------|---------------|
| FS Crawler (Media Metadata) | `python/fs/fs-crawler/` | FastAPI | 8004 | `app/main.py` (uvicorn) |
| FS Crawler UI | `python/fs/fs-crawler/ui/` | React + Vite | 3004 | `vite.config.ts` |
| LOSM | `python/ai/losm/` | FastAPI | TBD | No port configured in settings |
| Event Pipeline | `python/event-pipeline/` | Script runner | N/A | No server |
| HTML Importer | `python/ingest/html-importer/` | CLI tool | N/A | No server |

#### Angular Applications

| Application | Path | Framework | Port | Config Source |
|-------------|------|-----------|------|---------------|
| Nexus Console | `angular/nexus-console/` | Angular | 3060 | `angular.json` |

#### React/Vite UI Applications (nexus-ui)

| Application | Path | Framework | Port | Config Source |
|-------------|------|-----------|------|---------------|
| Nexus RMS | `nexus-ui/nexus-rms/` | Angular | 3000 | `angular.json` |
| Nexus Plurality UI | `nexus-ui/nexus-plurality-ui/` | React + Vite | 3001 | `package.json` |
| Nexus Duality UI | `nexus-ui/nexus-duality-ui/` | React + Vite | 3002 | `package.json` |
| Prompt Architect | `nexus-ui/prompt-architect/` | React + Vite | 3003 | `package.json` |

## Development Commands

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
- **Broker Gateway (Spring)**: Runs on port 8081 (request routing)
- **Broker Gateway (Quarkus)**: Runs on port 8090 (request routing)
- **Broker Gateway Proxy (AdonisJS)**: Runs on port 8079 (reverse proxy)
- **Broker Gateway Proxy (TypeScript)**: Runs on port 3333 (reverse proxy)
- **Broker Service Proxy (TypeScript)**: Runs on port 3334 (service proxy)
- **Service Mesh UI**: Access via browser for service visualization

### Common Directories

- **Java Services**: `jvm/spring/service-broker/`, `jvm/spring/service-registry/`, `jvm/shared/`, `jvm/quarkus/`, `jvm/helidon/`
- **Node.js Services**: `typescript/`, `moleculer/`, `adonisjs/` subdirectories
- **Python Services**: `python/` directory
- **Go Services**: `legacy/go/` and `go/` directories
- **UI Applications**: `nexus-ui/`, `nexus/angular/`
- **Docker Configs**: Look for `docker-compose.yml` and `Dockerfile` files in service directories

### Key Features

- **Polyglot Support**: Java (Spring Boot 3.5.0, Quarkus 3.15.1, Helidon MP), Node.js (Express, NestJS, AdonisJS, Moleculer), Python (FastAPI, Django, Flask), Go (standard library, Gin)
- **Service Mesh UI**: Real-time visualization, dependency graphs, service operations
- **External Service Integration**: Proxy with fallback mechanisms
- **Deployment**: Docker Compose recommended for local development

## Important Files

- **docker-compose.yml**: Main deployment configuration (check service-specific directories)
- **jvm/pom.xml**: Root Maven configuration for Java services
- **.github/workflows/ci.yml**: CI pipeline for Java builds
- **README.md**: Detailed platform overview and evolution

## Notes

- Services communicate via REST/HTTP with JSON payloads
- Each service typically has its own configuration (application.yml, .env, etc.)
- Look for service-specific startup scripts in service directories
- The platform emphasizes loose coupling through broker-based communication
- See `PORT_CONFLICTS.md` for port configuration discrepancies
- Spring Broker Gateway connects to File System Server (restfs) on port 4040
