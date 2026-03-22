# Service Registry - Service Management System

A comprehensive server/service/configuration management system for the Nexus Platform. This service provides centralized management of servers, services, frameworks, deployments, and configurations across the entire microservices ecosystem.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Data Model](#data-model)
- [REST API Reference](#rest-api-reference)
- [Backend Connections Feature](#backend-connections-feature)
- [API Examples](#api-examples)
- [Visual Diagrams](#visual-diagrams)
- [Production Deployment Guide](#production-deployment-guide)
- [Implementation Summary](#implementation-summary)
- [Future Enhancements](#future-enhancements)

---

## Overview

The Service Registry is a production-ready service management system providing centralized management of servers, services, frameworks, deployments, and configurations across the entire microservices ecosystem. It serves as the central service registry for the Nexus Platform and handles the growing complexity of managing multiple services across different frameworks (Spring Boot, Quarkus, Micronaut, NestJS, AdonisJS, Moleculer, Python, Go, Helidon, etc.) using the broker pattern.

### ✅ **PRODUCTION READY CAPABILITIES**

- **Service Registration**: External services register via `/api/registry/register`
- **Service Discovery**: Operation-based service lookup with `/api/registry/services/by-operation/{operation}`
- **Service Details**: Complete service information with `/api/registry/services/{serviceName}/details`
- **Heartbeat Monitoring**: Continuous health monitoring with `/api/registry/heartbeat/{serviceName}`
- **MySQL Persistence**: Production-grade persistent storage
- **Polyglot Support**: Framework-agnostic service integration
- **Real-time Updates**: Live service status tracking with Redis caching
- **Deployment Management**: Complete service instance tracking across servers
- **Hierarchical Services**: Parent/child (hosted/embedded) service relationships

### Design Principles

1. **Framework Agnostic** - Support for any framework: Spring Boot, Quarkus, Micronaut, NestJS, AdonisJS, Moleculer, Express, Django, Flask, FastAPI, .NET, Go, Rust, Helidon, etc.

2. **Environment Aware** - Track services across Development, Staging, Production, and Test environments

3. **Dependency Tracking** - Maintain service dependency graphs for impact analysis, deployment ordering, troubleshooting, and architecture visualization

4. **Configuration Management** - Centralized configuration with environment-specific overrides, type safety, and audit trails

5. **Deployment Tracking** - Monitor service instances with health status, version tracking, resource allocation, and lifecycle management

---

## Quick Start

### Running the Service

```bash
cd spring/service-registry
./mvnw spring-boot:run
```

Or use the provided scripts:
```bash
./start.sh      # Linux/Mac
start.bat       # Windows
```

The service will start on port **8085**.

### Access Points

- **API**: http://localhost:8085/api/
- **H2 Console** (dev only): http://localhost:8085/h2-console

### Database Configuration

The application uses MySQL database for persistence:

- **JDBC URL**: `jdbc:mysql://localhost:3306/services_console`
- **Username**: `root`
- **Password**: `rootpass`

### Common Commands

```bash
    
curl -X POST http://localhost:8085/api/registry/heartbeat/python-service
```

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Service Registry                        │
│                      (Port 8085)                                │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Framework   │  │   Service    │  │    Server    │          │
│  │  Management  │  │  Management  │  │  Management  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │  Deployment  │  │Configuration │                            │
│  │  Management  │  │  Management  │                            │
│  └──────────────┘  └──────────────┘                            │
│                                                                 │
│                    ┌──────────────┐                             │
│                    │  MySQL/H2    │                             │
│                    └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

- **Framework**: Spring Boot 3.x
- **Language**: Java 21
- **Database**: MySQL (production), H2 (development fallback)
- **ORM**: Spring Data JPA
- **Caching**: Redis (optional, for real-time service status)
- **Build Tool**: Maven

---

## Data Model

### Entity Relationship Diagram

```
┌─────────────────────┐
│     Framework       │
│─────────────────────│
│ id (PK)             │
│ name                │
│ description         │
│ category            │
│ language            │
│ latestVersion       │
│ documentationUrl    │
│ supportsBrokerPattern│
└──────────┬──────────┘
           │ 1
           │
           │ N
┌──────────▼──────────┐         ┌─────────────────────┐
│      Service        │         │ ServiceConfiguration│
│─────────────────────│         │─────────────────────│
│ id (PK)             │◄────────│ id (PK)             │
│ name                │    1:N  │ service_id (FK)     │
│ description         │         │ configKey           │
│ framework_id (FK)   │         │ configValue         │
│ type                │         │ environment         │
│ repositoryUrl       │         │ type                │
│ version             │         │ isSecret            │
│ defaultPort         │         │ description         │
│ healthCheckPath     │         └─────────────────────┘
│ apiBasePath         │
│ status              │
└──────────┬──────────┘
           │ N:M (self-referential)
           │ ┌──────────────────┐
           └─┤ service_dependencies│
             └──────────────────┘
           │ 1
           │
           │ N
┌──────────▼──────────┐
│    Deployment       │
│─────────────────────│
│ id (PK)             │
│ service_id (FK)     │
│ server_id (FK)      │
│ port                │
│ contextPath         │
│ version             │
│ status              │
│ environment         │
│ healthCheckUrl      │
│ healthStatus        │
│ processId           │
│ containerName       │
│ deploymentPath      │
│ deployedAt          │
│ startedAt           │
│ stoppedAt           │
└──────────┬──────────┘
           │ N
           │
           │ 1
┌──────────▼──────────┘
│      Server         │
│─────────────────────│
│ id (PK)             │
│ hostname            │
│ ipAddress           │
│ type                │
│ environment         │
│ operatingSystem     │
│ cpuCores            │
│ memoryMb            │
│ diskGb              │
│ region              │
│ cloudProvider       │
│ status              │
│ description         │
└─────────────────────┘
```

### Core Entities

#### 1. Framework

Represents technology frameworks used across the platform.

**Attributes:**
- `id`, `name` (unique), `description`
- `vendor` (relationship to FrameworkVendor)
- `category` (relationship to FrameworkCategory)
- `language` (relationship to FrameworkLanguage)
- `currentVersion`, `ltsVersion`, `url`
- `supportsBrokerPattern` (boolean)
- `activeFlag`, `createdAt`, `updatedAt`

**Note:** Categories, languages, and vendors are stored as separate lookup entities with relationships.

#### 2. Service

Represents a microservice or application.

**Attributes:**
- `id`, `name` (unique), `description`
- `framework` (relationship to Framework)
- `type` (relationship to ServiceType)
- `componentOverride` (relationship to VisualComponent, optional)
- `parentService` (self-referential, for hierarchical/hosted services)
- `defaultPort`, `apiBasePath`, `repositoryUrl`
- `version`, `status`, `activeFlag`
- `createdAt`, `updatedAt`

**Relationships:**
- Belongs to a Framework
- Has a ServiceType (from lookup table)
- Has many Deployments
- Has many Configurations
- Has parent/child relationships with other Services (sub-modules)
- Has dependencies via ServiceDependency join table

#### 3. Server (Host)

Represents physical or virtual servers.

**Attributes:**
- `id`, `hostname` (unique), `ipAddress`
- `type` (relationship to ServerType)
- `environmentType` (relationship to EnvironmentType)
- `operatingSystem` (relationship to OperatingSystem)
- `cpuCores`, `memory`, `disk`
- `status`, `region`, `cloudProvider`
- `description`, `activeFlag`
- `createdAt`, `updatedAt`

**Note:** Server types, environments, and operating systems are stored as separate lookup entities.

#### 4. Deployment

Represents a service instance running on a server.

**Attributes:**
- `id`
- `service` (relationship to Service)
- `server` (relationship to Host)
- `environment` (relationship to EnvironmentType)
- `port`, `contextPath`, `version`
- `status` (RUNNING, STOPPED, STARTING, STOPPING, FAILED, UNKNOWN)
- `healthCheckUrl`, `healthStatus` (HEALTHY, UNHEALTHY, DEGRADED, UNKNOWN)
- `lastHealthCheck`, `processId`, `containerName`, `deploymentPath`
- `deployedAt`, `startedAt`, `stoppedAt`
- `activeFlag`, `createdAt`, `updatedAt`

**Deployment Status Flow:** STOPPED → STARTING → RUNNING → STOPPING → STOPPED (or FAILED)

#### 5. ServiceConfiguration

Environment-specific configuration for services.

**Attributes:**
- `id`, `serviceId` (foreign key), `service` (relationship)
- `configKey`, `configValue`
- `configTypeId` (relationship to ServiceConfigType)
- `environmentId` (relationship to EnvironmentType)
- `description`, `activeFlag`
- `createdAt`, `updatedAt`

#### 6. ServiceBackend

Represents backend connections between service deployments.

**Attributes:**
- `id`
- `serviceDeploymentId` (the service using a backend)
- `backendDeploymentId` (the backend being used)
- `role` (PRIMARY, BACKUP, ARCHIVE, CACHE, SHARD, READ_REPLICA)
- `priority`, `routingKey`, `weight`
- `isActive`, `description`
- `createdAt`, `updatedAt`

---

## REST API Reference

Base URL: `http://localhost:8085/api`

### Service Registry (External Services)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/registry/register` | Register an external service |
| POST | `/registry/heartbeat/{serviceName}` | Update service heartbeat |
| GET | `/registry/services` | Get all registered services |
| GET | `/registry/services/with-hosted` | Get all services with hosted services |
| GET | `/registry/services/{serviceName}/hosted` | Get hosted services for a service |
| GET | `/registry/services/by-operation/{operation}` | Find service by operation |
| GET | `/registry/services/{serviceName}/details` | Get service details with endpoint URL |
| POST | `/registry/deregister/{serviceName}` | Deregister a service |

### Frameworks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/frameworks` | List all frameworks |
| GET | `/frameworks/all` | List all frameworks (explicit) |
| GET | `/frameworks/{id}` | Get framework by ID |
| GET | `/frameworks/name/{name}` | Get framework by name |
| GET | `/frameworks/broker-compatible` | List broker-compatible frameworks |
| POST | `/frameworks` | Create framework |
| PUT | `/frameworks/{id}` | Update framework |
| DELETE | `/frameworks/{id}` | Delete framework |

### Services

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/services` | List all services |
| GET | `/services/all` | List all services (explicit) |
| GET | `/services/{id}` | Get service by ID |
| GET | `/services/name/{name}` | Get service by name |
| GET | `/services/framework/{frameworkId}` | List by framework |
| GET | `/services/{id}/dependencies` | Get service dependencies |
| GET | `/services/{id}/dependents` | Get dependent services |
| GET | `/services/{id}/sub-modules` | Get sub-modules for a service |
| GET | `/services/standalone` | Get standalone/parent services |
| POST | `/services` | Create service |
| PUT | `/services/{id}` | Update service |
| DELETE | `/services/{id}` | Delete service |

### Servers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/servers` | List all servers |
| GET | `/servers/{id}` | Get server by ID |
| GET | `/servers/hostname/{hostname}` | Get server by hostname |
| POST | `/servers` | Create server |
| PUT | `/servers/{id}` | Update server |
| DELETE | `/servers/{id}` | Delete server |

### Deployments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/deployments` | List all deployments |
| GET | `/deployments/{id}` | Get deployment by ID |
| GET | `/deployments/service/{serviceId}` | List by service |
| POST | `/deployments` | Create deployment |
| PUT | `/deployments/{id}` | Update deployment |
| PATCH | `/deployments/{id}/status?status={status}` | Update deployment status |
| PATCH | `/deployments/{id}/health?healthStatus={status}` | Update health status |
| DELETE | `/deployments/{id}` | Delete deployment |

### Configurations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/configurations` | List all configs |
| GET | `/configurations/{id}` | Get config by ID |
| GET | `/configurations/service/{serviceId}` | List by service |
| GET | `/configurations/service/{serviceId}/environment/{environmentId}` | List by service & env |
| GET | `/configurations/service/{serviceId}/key/{key}/environment/{environmentId}` | Get specific config |
| POST | `/configurations` | Create config |
| PUT | `/configurations/{id}` | Update config |
| DELETE | `/configurations/{id}` | Delete config |

### Backend Connections

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/backends/deployment/{deploymentId}` | Get backends for a deployment |
| GET | `/backends/consumers/{deploymentId}` | Get consumers of a deployment |
| GET | `/backends/deployment/{deploymentId}/details` | Get deployment with all connections |
| POST | `/backends` | Add backend connection |
| PUT | `/backends/{backendId}` | Update backend connection |
| DELETE | `/backends/{backendId}` | Remove backend connection |

### Lookup Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/service-types` | List all service types |
| GET | `/service-types/{id}` | Get service type by ID |
| POST | `/service-types` | Create service type |
| PUT | `/service-types/{id}` | Update service type |
| DELETE | `/service-types/{id}` | Delete service type |
| GET | `/environments` | List all environment types |
| GET | `/environments/{id}` | Get environment type by ID |
| POST | `/environments` | Create environment type |
| PUT | `/environments/{id}` | Update environment type |
| DELETE | `/environments/{id}` | Delete environment type |
| GET | `/dependencies` | List all service dependencies |

---

## Backend Connections Feature

### Overview

Track relationships between service instances (deployments). Essential for modeling:
- file-service → file-system-server connections
- Primary/backup configurations
- Multi-backend setups

### Concepts

```
Service (Template)
└── Deployments (Instances)
    └── Backends (Connections to other instances)
```

**Example:**
```
Service: file-system-server
├── Deployment 1: localhost:4040 (for broker-gateway-A)
├── Deployment 2: localhost:4041 (for broker-gateway-B)
└── Deployment 3: prod-server:4040 (for production)

Service: file-service
├── Deployment 1: localhost:8084
│   └── Backends:
│       ├── file-system-server (localhost:4040) - PRIMARY
│       └── file-system-server (localhost:4041) - BACKUP
└── Deployment 2: localhost:8094
    └── Backends:
        └── file-system-server (localhost:4042) - PRIMARY
```

### Backend Roles

| Role | Description | Use Case |
|------|-------------|----------|
| `PRIMARY` | Main backend | Primary data source |
| `BACKUP` | Failover backend | Used when primary fails |
| `ARCHIVE` | Cold storage | Old/archived data |
| `CACHE` | Hot cache layer | Fast access cache |
| `SHARD` | Data partition | Handles subset of data |
| `READ_REPLICA` | Read-only copy | Handles read queries |

### Backend API Endpoints

Base URL: `http://localhost:8085/api/backends`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/deployment/{deploymentId}` | Get backends for a deployment |
| GET | `/consumers/{deploymentId}` | Get consumers of a deployment |
| GET | `/deployment/{deploymentId}/details` | Get deployment with all connections |
| POST | `/` | Add backend connection |
| PUT | `/{backendId}` | Update backend connection |
| DELETE | `/{backendId}` | Remove backend connection |

**Request Body for POST /backends:**
```json
{
  "serviceDeploymentId": 123,
  "backendDeploymentId": 456,
  "role": "PRIMARY",
  "priority": 1
}
```

**Request Body for PUT /backends/{backendId}:**
```json
{
  "role": "BACKUP",
  "priority": 2,
  "isActive": true
}
```

### Quick Examples

```bash
# Get backends for a deployment
curl http://localhost:8085/api/backends/deployment/123

# Add a backend connection
curl -X POST http://localhost:8085/api/backends \
  -H "Content-Type: application/json" \
  -d '{
    "serviceDeploymentId": 123,
    "backendDeploymentId": 456,
    "role": "PRIMARY",
    "priority": 1
  }'

# See who uses this deployment as backend
curl http://localhost:8085/api/backends/consumers/456
```

---

## API Examples

### Frameworks API

```bash
# List all frameworks
curl http://localhost:8085/api/frameworks

# Get Spring Boot framework
curl http://localhost:8085/api/frameworks/name/Spring%20Boot

# List broker-compatible frameworks
curl http://localhost:8085/api/frameworks/broker-compatible

# Create new framework
curl -X POST http://localhost:8085/api/frameworks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Micronaut",
    "description": "Modern JVM-based framework",
    "category": "JAVA_MICRONAUT",
    "language": "Java",
    "latestVersion": "4.0.0",
    "documentationUrl": "https://micronaut.io",
    "supportsBrokerPattern": false
  }'
```

### Services API

```bash
# List all services
curl http://localhost:8085/api/services

# Get service by name
curl http://localhost:8085/api/services/name/broker-gateway

# Get service dependencies
curl http://localhost:8085/api/services/3/dependencies

# Create new service
curl -X POST http://localhost:8085/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "name": "payment-service",
    "description": "Payment processing service",
    "framework": {"id": 1},
    "type": "REST_API",
    "defaultPort": 8090,
    "healthCheckPath": "/actuator/health",
    "apiBasePath": "/api/payments",
    "status": "ACTIVE",
    "version": "1.0.0"
  }'

# Add service dependency
curl -X POST http://localhost:8085/api/services/5/dependencies/2

# Remove service dependency
curl -X DELETE http://localhost:8085/api/services/5/dependencies/2
```

### Deployments API

```bash
# List all deployments
curl http://localhost:8085/api/deployments

# List running deployments
curl http://localhost:8085/api/deployments/status/RUNNING

# Create new deployment
curl -X POST http://localhost:8085/api/deployments \
  -H "Content-Type: application/json" \
  -d '{
    "service": {"id": 1},
    "server": {"id": 1},
    "port": 8080,
    "version": "1.0.0",
    "status": "STOPPED",
    "environment": "DEVELOPMENT",
    "healthCheckUrl": "http://localhost:8080/actuator/health",
    "deploymentPath": "/opt/services/broker-gateway"
  }'

# Start deployment
curl -X POST http://localhost:8085/api/deployments/1/start

# Stop deployment
curl -X POST http://localhost:8085/api/deployments/1/stop

# Update health status
curl -X POST "http://localhost:8085/api/deployments/1/health?healthStatus=HEALTHY"
```

### Configurations API

```bash
# List configurations for a service
curl http://localhost:8085/api/configurations/service/1

# List development configurations
curl http://localhost:8085/api/configurations/service/1/environment/DEVELOPMENT

# Create configuration
curl -X POST http://localhost:8085/api/configurations \
  -H "Content-Type: application/json" \
  -d '{
    "service": {"id": 1},
    "configKey": "spring.data.mongodb.uri",
    "configValue": "mongodb://localhost:27017/mydb",
    "environment": "DEVELOPMENT",
    "type": "DATABASE_URL",
    "isSecret": false,
    "description": "MongoDB connection string"
  }'

# Create secret configuration
curl -X POST http://localhost:8085/api/configurations \
  -H "Content-Type: application/json" \
  -d '{
    "service": {"id": 1},
    "configKey": "api.secret.key",
    "configValue": "super-secret-key-12345",
    "environment": "PRODUCTION",
    "type": "API_KEY",
    "isSecret": true,
    "description": "API secret key for external service"
  }'
```

### PowerShell Examples

```powershell
# Get all services
$response = Invoke-RestMethod -Uri "http://localhost:8085/api/services" -Method Get
$response | ConvertTo-Json -Depth 10

# Create service
$body = @{
    name = "notification-service"
    description = "Email and SMS notifications"
    framework = @{ id = 1 }
    type = "REST_API"
    defaultPort = 8095
    healthCheckPath = "/actuator/health"
    apiBasePath = "/api/notifications"
    status = "ACTIVE"
    version = "1.0.0"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8085/api/services" `
    -Method Post `
    -Body $body `
    -ContentType "application/json"

# Get service dependencies
$serviceId = 3
$deps = Invoke-RestMethod -Uri "http://localhost:8085/api/services/$serviceId/dependencies" -Method Get
$deps | ForEach-Object { Write-Host "$($_.name) - $($_.description)" }
```

---

## Visual Diagrams

### Service Dependency Graph (Sample Data)

```
                    ┌──────────────────┐
                    │  broker-gateway  │
                    │  (Spring Boot)   │
                    │  Port: 8080      │
                    └────────┬─────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
        ┌───────────┐  ┌──────────┐  ┌──────────┐
        │user-service│  │login-svc │  │file-svc  │
        │(Spring)    │  │(Spring)  │  │(Spring)  │
        │Port: 8083  │  │Port: 8082│  │Port: 4040│
        └─────┬──────┘  └────┬─────┘  └──────────┘
              │              │
              └──────────────┘
                     │
                     ▼
              ┌──────────┐
              │note-svc  │
              │(Spring)  │
              │Port: 8084│
              └──────────┘
```

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    localhost (127.0.0.1)                     │
│                    Development Environment                    │
│─────────────────────────────────────────────────────────────│
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ broker-gateway  │  │  user-service   │  │ login-svc   │ │
│  │   Port: 8080    │  │   Port: 8083    │  │ Port: 8082  │ │
│  │   Status: ✓     │  │   Status: ✓     │  │ Status: ✓   │ │
│  │   Health: ✓     │  │   Health: ✓     │  │ Health: ✓   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │  file-service   │  │  note-service   │  │ service-registry │ │
│  │   Port: 4040    │  │   Port: 8084    │  │ Port: 8085  │ │
│  │   Status: ✓     │  │   Status: ✓     │  │ Status: ✓   │ │
│  │   Health: ✓     │  │   Health: ✓     │  │ Health: ✓   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Configuration Hierarchy

```
Service: broker-gateway
│
├── ALL Environments
│   ├── server.port = 8080
│   ├── spring.application.name = broker-gateway
│   └── logging.level.root = INFO
│
├── DEVELOPMENT
│   ├── spring.data.mongodb.uri = mongodb://localhost:27017/broker
│   ├── logging.level.com.angrysurfer = DEBUG
│   └── spring.devtools.restart.enabled = true
│
├── STAGING
│   ├── spring.data.mongodb.uri = mongodb://staging-db:27017/broker
│   └── logging.level.com.angrysurfer = INFO
│
└── PRODUCTION
    ├── spring.data.mongodb.uri = mongodb://prod-db:27017/broker
    ├── api.secret.key = ********** (secret)
    └── logging.level.com.angrysurfer = WARN
```

### Deployment Status Flow

```
                    ┌─────────┐
                    │ STOPPED │
                    └────┬────┘
                         │
                         │ start()
                         ▼
                    ┌─────────┐
              ┌────►│STARTING │
              │     └────┬────┘
              │          │
              │          │ success
              │          ▼
              │     ┌─────────┐
              │     │ RUNNING │◄────┐
              │     └────┬────┘     │
              │          │          │
              │          │ stop()   │ restart
              │          ▼          │
              │     ┌─────────┐    │
              └─────│STOPPING │────┘
        failure     └────┬────┘
                         │
                         │ stopped
                         ▼
                    ┌─────────┐
                    │ STOPPED │
                    └─────────┘
                         │
                         │ error
                         ▼
                    ┌─────────┐
                    │ FAILED  │
                    └─────────┘
```

### Health Status States

```
┌─────────┐
│ UNKNOWN │  (Initial state, no health check yet)
└────┬────┘
     │
     │ health check performed
     ▼
┌─────────┐
│ HEALTHY │  (All checks passing)
└────┬────┘
     │
     │ partial failure
     ▼
┌─────────┐
│DEGRADED │  (Some checks failing)
└────┬────┘
     │
     │ complete failure
     ▼
┌──────────┐
│UNHEALTHY │  (All checks failing)
└──────────┘
```

---

## Production Deployment Guide

### Phase 1: Database Migration

#### PostgreSQL Configuration

Update `application.properties`:
```properties
# PostgreSQL Configuration
spring.datasource.url=jdbc:postgresql://localhost:5432/hostserver
spring.datasource.username=hostserver_user
spring.datasource.password=${DB_PASSWORD}
spring.datasource.driver-class-name=org.postgresql.Driver

# JPA Configuration
spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect
spring.jpa.hibernate.ddl-auto=validate
spring.jpa.show-sql=false
```

#### MySQL Configuration

```properties
# MySQL Configuration
spring.datasource.url=jdbc:mysql://localhost:3306/hostserver?useSSL=true&serverTimezone=UTC
spring.datasource.username=hostserver_user
spring.datasource.password=${DB_PASSWORD}
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver

# JPA Configuration
spring.jpa.database-platform=org.hibernate.dialect.MySQLDialect
spring.jpa.hibernate.ddl-auto=validate
spring.jpa.show-sql=false
```

### Phase 2: Security

Add Spring Security dependency and configure:

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf().disable()
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/api/**").authenticated()
            )
            .httpBasic();

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

### Phase 3: Monitoring

```properties
# Actuator Configuration
management.endpoints.web.exposure.include=health,info,metrics,prometheus
management.endpoint.health.show-details=when-authorized
management.metrics.export.prometheus.enabled=true
```

### Phase 4: Performance

#### Connection Pooling (HikariCP)

```properties
spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.minimum-idle=5
spring.datasource.hikari.connection-timeout=30000
spring.datasource.hikari.idle-timeout=600000
spring.datasource.hikari.max-lifetime=1800000
```

#### Caching (Redis)

```java
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        return RedisCacheManager.create(connectionFactory);
    }
}
```

### Docker Deployment

```dockerfile
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY target/service-registry-*.jar app.jar
EXPOSE 8085
ENTRYPOINT ["java", "-jar", "app.jar"]
```

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: hostserver
      POSTGRES_USER: hostserver_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  service-registry:
    build: .
    ports:
      - "8085:8085"
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/hostserver
      SPRING_DATASOURCE_USERNAME: hostserver_user
      SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD}
      SPRING_REDIS_HOST: redis
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
```

---

## Implementation Summary

### What Was Built

A comprehensive **Server/Service/Configuration Management System** for the Nexus Platform that addresses the growing cognitive load of managing multiple microservices across different frameworks.

### Core Features

1. **Framework Management** - Catalog of all frameworks with version tracking and broker pattern compatibility
2. **Service Management** - Complete service inventory with dependency tracking
3. **Server Management** - Server inventory with resource specs across environments
4. **Deployment Management** - Track service instances with health monitoring
5. **Configuration Management** - Environment-specific configurations with secret management

### Sample Data

The system initializes with real data from the Nexus Platform:

**Frameworks (6):** Spring Boot 3.x, Quarkus 3.x, Micronaut 4.x, NestJS 10.x, AdonisJS 6.x, Moleculer 0.14.x

**Services (7):** broker-gateway, user-service, login-service, file-service, note-service, quarkus-broker-gateway, moleculer-search

**User Services Architecture:**
- **user-access-service** (Port 8083): MySQL-based user registration and authentication
- **login-service** (Port 8082): Redis-based session management
- **user-service** (deprecated): MongoDB-based social media functionality (being phased out)

**Note:** The user-service is deprecated and will be removed. User authentication is now handled by:
- `user-access-service` (MySQL) - User registration and credential validation
- `login-service` (Redis) - Session token management

### Use Cases Enabled

1. **Service Discovery** - Find services by framework, type, or status
2. **Impact Analysis** - Determine which services will be affected by changes
3. **Deployment Planning** - Plan deployment order based on dependencies
4. **Environment Management** - Manage configurations across environments
5. **Health Monitoring** - Check health of all running deployments
6. **Capacity Planning** - View server resources and deployment distribution
7. **Framework Migration** - Identify services for framework migration

---

## Future Enhancements

### Phase 1: Monitoring
- Automated health checks
- Metrics collection
- Alerting system

### Phase 2: Automation
- Deployment automation
- Configuration sync
- Service registration

### Phase 3: Advanced Features
- Service mesh integration (Istio/Linkerd)
- Container orchestration (Kubernetes)
- Multi-region support
- Disaster recovery

### Phase 4: Intelligence
- Dependency visualization
- Performance analytics
- Capacity forecasting
- Anomaly detection

### Additional Planned Features

1. **Health Monitoring**: Automated health checks for deployments
2. **Metrics Collection**: Performance metrics and resource usage
3. **Deployment Automation**: API endpoints to trigger deployments
4. **Configuration Sync**: Push configurations to running services
5. **Service Mesh Integration**: Integration with Istio/Linkerd
6. **Audit Logging**: Track all changes to services and configurations
7. **API Gateway Integration**: Sync with broker-gateway service registry
8. **Container Orchestration**: Kubernetes/Docker integration
9. **Alerting**: Notifications for service failures or health issues
10. **Version Management**: Track service versions and rollback capabilities

---

## Troubleshooting

### Service won't start

```bash
# Check if port is already in use
netstat -ano | findstr :8085

# Check database connection
# The application uses MySQL:
# JDBC URL: jdbc:mysql://localhost:3306/services_console
# Username: root
# Password: rootpass
```

### Database Schema Issues

If you encounter database schema compatibility errors during startup:

**Option 1: Run the automated database fix script**
```bash
chmod +x run-db-fix.sh
./run-db-fix.sh
```

**Option 2: Use the temporary configuration to update the schema**
```bash
chmod +x update-schema.sh
./update-schema.sh
```

**Option 3: Run SQL commands manually**
```bash
mysql -u root -p services_console < database-fix.sql
```

### Can't connect to API

```bash
# Verify service is running
curl http://localhost:8085/actuator/health

# Check logs for errors
```

### Data not showing

```bash
# Check if DataInitializer ran
# Look for "Initializing sample data..." in logs

# Verify database connection
# Connect to MySQL and run:
# SELECT * FROM frameworks;
# SELECT * FROM services;
```

---

## Integration with Broker Pattern

Services marked with `supportsBrokerPattern=true` can integrate with the broker-gateway for:
- Dynamic service registration
- Request routing
- Service orchestration
- Health monitoring

---

## Database Schema Reference

### Frameworks Table
```sql
CREATE TABLE frameworks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(1000),
    vendor_id BIGINT,
    category_id BIGINT NOT NULL,
    language_id BIGINT NOT NULL,
    current_version VARCHAR(50),
    lts_version VARCHAR(50),
    url VARCHAR(500),
    supports_broker_pattern BOOLEAN DEFAULT FALSE,
    active_flag BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Services Table
```sql
CREATE TABLE services (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(1000),
    framework_id BIGINT NOT NULL REFERENCES frameworks(id),
    service_type_id BIGINT NOT NULL REFERENCES service_types(id),
    component_override_id BIGINT,
    parent_service_id BIGINT REFERENCES services(id),
    default_port INTEGER,
    api_base_path VARCHAR(255),
    repository_url VARCHAR(500),
    version VARCHAR(50),
    status VARCHAR(50),
    active_flag BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Service Dependencies Table
```sql
CREATE TABLE service_dependency (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    service_id BIGINT NOT NULL REFERENCES services(id),
    target_service_id BIGINT NOT NULL REFERENCES services(id),
    UNIQUE KEY unique_dependency (service_id, target_service_id)
);
```

### Servers Table
```sql
CREATE TABLE servers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    hostname VARCHAR(255) NOT NULL UNIQUE,
    ip_address VARCHAR(50) NOT NULL,
    server_type_id BIGINT NOT NULL REFERENCES server_types(id),
    environment_type_id BIGINT NOT NULL REFERENCES environment_types(id),
    operating_system_id BIGINT NOT NULL REFERENCES operating_systems(id),
    cpu_cores INTEGER,
    memory VARCHAR(50),
    disk VARCHAR(50),
    status VARCHAR(50),
    region VARCHAR(100),
    cloud_provider VARCHAR(100),
    description VARCHAR(1000),
    active_flag BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Deployments Table
```sql
CREATE TABLE deployments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    service_id BIGINT NOT NULL REFERENCES services(id),
    server_id BIGINT NOT NULL REFERENCES servers(id),
    environment_id BIGINT NOT NULL REFERENCES environment_types(id),
    version VARCHAR(50),
    status VARCHAR(50),
    port INTEGER,
    context_path VARCHAR(255),
    health_check_url VARCHAR(500),
    health_status VARCHAR(50),
    last_health_check TIMESTAMP,
    process_id VARCHAR(100),
    container_name VARCHAR(255),
    deployment_path VARCHAR(500),
    deployed_at TIMESTAMP,
    started_at TIMESTAMP,
    stopped_at TIMESTAMP,
    active_flag BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Service Configs Table
```sql
CREATE TABLE service_configs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    service_id BIGINT NOT NULL REFERENCES services(id),
    config_type_id BIGINT NOT NULL REFERENCES service_config_types(id),
    environment_id BIGINT NOT NULL REFERENCES environment_types(id),
    config_key VARCHAR(255) NOT NULL,
    config_value VARCHAR(4000) NOT NULL,
    description VARCHAR(1000),
    active_flag BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Service Backends Table
```sql
CREATE TABLE service_backends (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    service_deployment_id BIGINT NOT NULL REFERENCES deployments(id),
    backend_deployment_id BIGINT NOT NULL REFERENCES deployments(id),
    role VARCHAR(50) NOT NULL,
    priority INTEGER,
    routing_key VARCHAR(100),
    weight INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    description VARCHAR(500),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE KEY unique_backend (service_deployment_id, backend_deployment_id, role)
);
```

### Lookup Tables

The system uses the following lookup tables for normalized data:

- `framework_vendors` - Framework vendors (e.g., VMware, Red Hat)
- `framework_categories` - Framework categories (e.g., JAVA_SPRING, NODE_NESTJS)
- `framework_languages` - Programming languages (e.g., Java, TypeScript)
- `service_types` - Service types (e.g., GATEWAY, REST_API, DATABASE)
- `server_types` - Server types (e.g., PHYSICAL, VIRTUAL, CONTAINER)
- `environment_types` - Environment types (e.g., DEVELOPMENT, PRODUCTION)
- `operating_systems` - Operating systems (e.g., Ubuntu, Windows)
- `service_config_types` - Configuration types (e.g., STRING, NUMBER, URL)
- `visual_components` - UI component definitions for admin console
- `libraries` and `library_categories` - Service libraries/dependencies

---

## License

See LICENSE file for details.
