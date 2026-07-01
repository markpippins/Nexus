# JVM Service Pipeline Flows

> Data flow, execution pipeline, and lifecycle diagrams for the JVM Spring Boot ecosystem:
> terrain (:8084), peb-kernel (:8080), broker-gateway (:8081), service-registry (:8085).

---

## 1. Architecture Overview

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '13px',
  'primaryBorderColor': '#555',
  'lineColor': '#666'
}}}%%

graph TB
    %% ===== STYLES =====
    classDef terrain fill:#1b4332,stroke:#2d6a4f,stroke-width:2px,color:#ddd
    classDef peb fill:#3d1308,stroke:#8b2500,stroke-width:2px,color:#ddd
    classDef broker fill:#4a1942,stroke:#7b2d8e,stroke-width:2px,color:#eee
    classDef registry fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#ddd
    classDef mcp fill:#0c2233,stroke:#1a6b8a,stroke-width:2px,color:#ddd
    classDef external fill:#2d2d2d,stroke:#888,stroke-width:2px,color:#ccc
    classDef data fill:#1a0a2e,stroke:#9b59b6,stroke-width:2px,color:#ddd

    %% ===== EXTERNAL CLIENTS =====
    subgraph CLIENTS["External Clients"]
        AI("AI Agents<br/><small>MCP stdio clients</small>"):::external
        HTTP("HTTP Clients<br/><small>OpenCode, curl, UIs</small>"):::external
    end

    %% ===== MCP BRIDGES =====
    subgraph MCP_B["MCP Bridges"]
        TMCP("terrain-mcp<br/><small>stdio → :8084 REST</small>"):::mcp
        PMCP("peb-mcp<br/><small>stdio → :8080 REST</small>"):::mcp
        CMCP("conduit-mcp<br/><small>stdio → :3100</small>"):::mcp
    end

    %% ===== JVM SERVICES =====
    subgraph JVM["JVM Spring Boot Services"]
        TERR("terrain :8084<br/><small>Infrastructure Topology Server</small>"):::terrain
        PEB("peb-kernel :8080<br/><small>Governance + Merkle Ledger</small>"):::peb
        BG("broker-gateway :8081<br/><small>API Gateway + Router</small>"):::broker
        SR("service-registry :8085<br/><small>Central Service Registry</small>"):::registry

        subgraph BROKER_MOD["service-broker Modules"]
            USVC("user-service<br/><small>PostgreSQL auth</small>"):::broker
            LSVC("login-service<br/><small>Redis sessions</small>"):::broker
            FSVC("file-service"):::broker
            NSVC("note-service"):::broker
            SSVC("search-service"):::broker
            OTHERS("... (11 more)"):::broker
        end
    end

    %% ===== DATA STORES =====
    subgraph DATA["Data Stores"]
        PG_TERRAIN[("PostgreSQL<br/>terrain schema")]:::data
        PG_PEB[("PostgreSQL<br/>peb schema + Flyway")]:::data
        PG_REGISTRY[("PostgreSQL<br/>registry schema")]:::data
        MONGO[("MongoDB<br/>atomic-mongodb")]:::data
        REDIS[("Redis<br/>caching + sessions")]:::data
    end

    %% ===== CONNECTIONS =====
    AI --> TMCP
    AI --> PMCP
    AI --> CMCP
    HTTP --> BG
    HTTP --> SR
    HTTP --> TERR

    TMCP -->|"topology queries"| TERR
    PMCP -->|"governance requests"| PEB
    CMCP -->|"WRP orchestration"| PMCP

    BG -->|"discovers services"| SR
    BG -->|"routes requests"| BROKER_MOD
    SR -->|"registers services"| BG

    TERR --> PG_TERRAIN
    PEB --> PG_PEB
    SR --> PG_REGISTRY
    SR -.->|"caching"| REDIS
    BG --> MONGO
    LSVC -.->|"sessions"| REDIS

    class CLIENTS external
```

---

## 2. terrain — Infrastructure Topology Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '13px',
  'primaryBorderColor': '#555'
}}}%%

graph TB
    %% ===== STYLES =====
    classDef controller fill:#1b4332,stroke:#2d6a4f,stroke-width:2px,color:#ddd
    classDef entity fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#ddd
    classDef data fill:#1a0a2e,stroke:#9b59b6,stroke-width:2px,color:#ddd
    classDef init fill:#3d1308,stroke:#8b2500,stroke-width:2px,color:#ddd
    classDef mcp fill:#0c2233,stroke:#1a6b8a,stroke-width:2px,color:#ddd

    subgraph INGRESS["Ingress Layer"]
        REST("REST API (:8084)<br/><small>Spring Boot 3.5.0</small>"):::controller
        TMCP("terrain-mcp<br/><small>MCP stdio bridge</small>"):::mcp
    end

    subgraph CONTROLLERS["Controller Layer (8 REST endpoints)"]
        direction TB
        MC("McpServerController<br/><small>/api/v1/mcp-servers</small>"):::controller
        RC("RunnableServiceController<br/><small>/api/v1/runnable-services</small>"):::controller
        SC("ServerController<br/><small>/api/v1/servers</small>"):::controller
        STC("ServiceTypeController<br/><small>/api/v1/service-types</small>"):::controller
        SDC("ServiceDependencyController<br/><small>/api/v1/service-dependencies</small>"):::controller
        CTC("CliToolController<br/><small>/api/v1/cli-tools</small>"):::controller
        BPC("BrokerProfileController<br/><small>/api/v1/broker-profiles</small>"):::controller
        RPC("RegistryServerProfileController<br/><small>/api/v1/registry-server-profiles</small>"):::controller
    end

    subgraph ENTITIES["Entity Layer (7 entities + polymorphic FK)"]
        direction TB
        MCP_E("McpServer<br/><small>port, transportType, workspacePath<br/>healthCheckUrl, version, status</small>"):::entity
        RS("RunnableService<br/><small>port, workspacePath, healthCheckUrl<br/>serviceTypeId, status</small>"):::entity
        SERV("Server<br/><small>hostname, ipAddress, os, status</small>"):::entity
        ST("ServiceType<br/><small>lookup: MCP, Microservice, etc.</small>"):::entity
        SD("ServiceDependency<br/><small>sourceType+sourceId → targetType+targetId<br/>criticality (REQUIRED/OPTIONAL)</small>"):::entity
        BP("BrokerProfile<br/><small>profileId, brokerUrl, imageUrl, autoConnect</small>"):::entity
        RP("RegistryServerProfile<br/><small>profileId, registryServerUrl, isActive</small>"):::entity
    end

    subgraph SEEDING["Startup Seeding (first run only)"]
        INIT("TopologyDataInitializer<br/><small>CommandLineRunner</small>"):::init
        CFG("JSON config files<br/><small>broker-profiles.json<br/>registry-server-profiles.json</small>"):::init
        CHECK("Check if records exist<br/><small>skip if not empty (idempotent)</small>"):::init
    end

    subgraph PG["PostgreSQL (terrain schema)"]
        TBL1["terrain.mcp_servers"]:::data
        TBL2["terrain.runnable_services"]:::data
        TBL3["terrain.servers"]:::data
        TBL4["terrain.service_types"]:::data
        TBL5["terrain.service_dependencies"]:::data
        TBL6["terrain.broker_profiles"]:::data
        TBL7["terrain.registry_server_profiles"]:::data
    end

    %% DATA FLOW
    TMCP -->|"tool calls"| REST
    REST -->|"dispatches to"| CONTROLLERS

    MC -->|"CRUD"| MCP_E
    RC -->|"CRUD"| RS
    SC -->|"CRUD"| SERV
    STC -->|"CRUD"| ST
    SDC -->|"CRUD"| SD
    CTC -->|"CRUD"| MCP_E
    BPC -->|"CRUD"| BP
    RPC -->|"CRUD"| RP

    MCP_E --> TBL1
    RS --> TBL2
    SERV --> TBL3
    ST --> TBL4
    SD --> TBL5
    BP --> TBL6
    RP --> TBL7

    INIT -->|"reads"| CFG
    INIT -->|"if empty"| CHECK
    CHECK -->|"inserts defaults"| BP
    CHECK -->|"inserts defaults"| RP

    NOTE("Seeding is idempotent: only runs on<br/>fresh databases. Hibernate ddl-auto=update<br/>auto-creates tables on first connect."):::init
    CHECK -.->|"(idempotent)"| NOTE
```

**API Surface:** All endpoints return `PagedResponse<T>` (paginated, sorted).

| Entity | GET List | GET By ID | POST | PUT | DELETE |
|--------|----------|-----------|------|-----|--------|
| McpServer | `/api/v1/mcp-servers` | `/{id}` | ✓ | ✓ | ✓ |
| RunnableService | `/api/v1/runnable-services` | `/{id}` | ✓ | ✓ | ✓ |
| Server | `/api/v1/servers` | `/{id}` | ✓ | ✓ | ✓ |
| ServiceType | `/api/v1/service-types` | `/{id}` | ✓ | ✓ | ✓ |
| ServiceDependency | `/api/v1/service-dependencies` | `/{id}` | ✓ | ✓ | ✓ |
| BrokerProfile | `/api/v1/broker-profiles` | `/{id}` | ✓ | ✓ | ✓ |
| RegistryServerProfile | `/api/v1/registry-server-profiles` | `/{id}` | ✓ | ✓ | ✓ |

---

## 3. peb-kernel — Governance Execution Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '13px',
  'primaryBorderColor': '#555'
}}}%%

graph TB
    %% ===== STYLES =====
    classDef external fill:#2d2d2d,stroke:#888,stroke-width:2px,color:#ccc
    classDef api fill:#4a1942,stroke:#7b2d8e,stroke-width:2px,color:#eee
    classDef core fill:#3d1308,stroke:#8b2500,stroke-width:2px,color:#ddd
    classDef hash fill:#1b4332,stroke:#2d6a4f,stroke-width:2px,color:#ddd
    classDef store fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#ddd
    classDef domain fill:#1a0a2e,stroke:#9b59b6,stroke-width:2px,color:#ddd

    subgraph EXT["External Actors"]
        CD("conduit-mcp<br/><small>WorkRequest orchestrator</small>"):::external
        MCP("peb-mcp<br/><small>MCP stdio → REST bridge</small>"):::external
        AG("AI Agents<br/><small>via peb-mcp</small>"):::external
    end

    subgraph MODULES["PEB Kernel — Multi-Module Maven Architecture"]
        direction TB

        subgraph L1["Layer 1 — peb-domain (pure Java, no Spring)"]
            DOM("Domain Entities"):::domain
            DOM_ENT["PebState, PebDecision,<br/>PebTransaction, PebTrace,<br/>PebViolation, PebCapability,<br/>PebStateHash"]:::domain
        end

        subgraph L2["Layer 2 — peb-store (infrastructure)"]
            STORE("Spring Data JPA + Flyway"):::store
            STORE_DETAIL["V1__init_peb_schema.sql<br/>PostgreSQL persistence<br/>JPA entity mappings"]:::store
        end

        subgraph L3["Layer 3 — peb-core (business logic)"]
            GOV("PebGovernanceEngine"):::core
            TXN("PebTransactionEngine"):::core
            INV("InvariantValidator"):::core
        end

        subgraph L4["Layer 4 — peb-hash (cryptographic)"]
            HASH("PebHashService"):::hash
            HASH_DETAIL["SHA-256 of structured JSON<br/>→ PebStateHash(value)<br/>→ beforeHash / afterHash<br/>→ parentDecisionId chain"]:::hash
        end

        subgraph L5["Layer 5 — peb-api (REST facade)"]
            API("AdmissionControllerFacade"):::api
            API_DETAIL["POST work requests<br/>state change submissions<br/>governance queries"]:::api
        end

        subgraph L6["Layer 6 — peb-adapters (ecosystem bridges)"]
            ADAPT("ConduitMcpAdapter<br/>LosmIrTransitionAdapter"):::api
        end

        subgraph L7["Layer 7 — peb-bootstrap (app root)"]
            BOOT("@SpringBootApplication<br/>application.yml"):::api
        end
    end

    subgraph FLOW["6-Step Execution Pipeline"]
        direction TB
        S1["1️⃣ Ingress<br/><small>Request arrives at AdmissionControllerFacade</small>"]:::api
        S2["2️⃣ Governance<br/><small>PebGovernanceEngine evaluates capability tokens</small>"]:::core
        S3["3️⃣ Validation<br/><small>InvariantValidator checks system invariants<br/>PebCapability: cap:&lt;action&gt;[:scope=&lt;res&gt;:&lt;filter&gt;]</small>"]:::core
        S4["4️⃣ Transaction<br/><small>PebTransactionEngine opens @Transactional context</small>"]:::core
        S5["5️⃣ Execution + Hashing<br/><small>PebHashService computes SHA-256 Merkle checksums<br/>beforeHash → apply changes → afterHash</small>"]:::hash
        S6["6️⃣ Commit<br/><small>PebTransaction + PebDecision saved to PostgreSQL<br/>parentDecisionId links to previous decision (DAG)</small>"]:::store
    end

    subgraph OUTPUT["Output Artifacts"]
        DEC("PebDecision<br/><small>beforeHash / afterHash<br/>parentDecisionId<br/>cryptographic DAG</small>"):::domain
        VIOL("PebViolation<br/><small>capability breaches<br/>authority leakage<br/>unauthorized changes</small>"):::domain
        TXN_OUT("PebTransaction<br/><small>inputs, outputs, state deltas<br/>versioned</small>"):::domain
    end

    %% ===== MODULE DEPENDENCIES =====
    DOM -.->|"imported by"| STORE
    STORE -.->|"imported by"| L3
    L3 <-.->|"bidirectional"| HASH
    L3 -.->|"exported via"| API
    API -.->|"bridged by"| ADAPT
    ADAPT -.->|"wired by"| BOOT

    %% ===== EXECUTION FLOW =====
    AG -->|"submit work request"| MCP
    MCP -->|"POST"| CD
    CD -->|"state change"| API

    API --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> S5
    S5 --> S6

    S5 -.->|"produces"| HASH
    S6 -.->|"generates"| DEC
    S6 -.->|"generates"| TXN_OUT
    S3 -.->|"violation detected"| VIOL
    VIOL -.->|"audit trail"| STORE

    S6 -.->|"persists to"| STORE
```

### Merkle Chain Detail

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '12px'
}}}%%

sequenceDiagram
    participant C as Client (conduit-mcp)
    participant API as peb-api<br/>AdmissionControllerFacade
    participant GOV as peb-core<br/>PebGovernanceEngine
    participant VAL as peb-core<br/>InvariantValidator
    participant TXN as peb-core<br/>PebTransactionEngine
    participant HASH as peb-hash<br/>PebHashService
    participant DB as peb-store<br/>PostgreSQL

    C->>API: POST state change request
    API->>GOV: delegate governance check
    GOV->>VAL: validate invariants + capabilities

    alt Valid Request
        VAL-->>GOV: approved
        GOV->>TXN: open @Transactional context
        TXN->>DB: load current PebState
        DB-->>TXN: current state (with checksum)
        TXN->>HASH: compute beforeHash(state)
        HASH-->>TXN: beforeHash (SHA-256)
        TXN->>TXN: apply state changes
        TXN->>HASH: compute afterHash(new state)
        HASH-->>TXN: afterHash (SHA-256)
        TXN->>DB: create PebDecision{beforeHash, afterHash, parentDecisionId}
        TXN->>DB: create PebTransaction{inputs, outputs, deltas}
        DB-->>TXN: committed
        TXN-->>GOV: success
        GOV-->>API: result
        API-->>C: 200 OK {decisionId, hashes, version}
    else Invariant Violation
        VAL-->>GOV: rejected
        GOV->>DB: create PebViolation{type, detail, context}
        GOV-->>API: error
        API-->>C: 4xx {violation, capability required}
    end
```

---

## 4. service-registry — Service Lifecycle

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '13px',
  'primaryBorderColor': '#555'
}}}%%

graph TB
    %% ===== STYLES =====
    classDef registry fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#ddd
    classDef entity fill:#1b4332,stroke:#2d6a4f,stroke-width:2px,color:#ddd
    classDef deploy fill:#4a1942,stroke:#7b2d8e,stroke-width:2px,color:#eee
    classDef backend fill:#1a0a2e,stroke:#9b59b6,stroke-width:2px,color:#ddd
    classDef config fill:#3d1308,stroke:#8b2500,stroke-width:2px,color:#ddd

    subgraph EXT["External Services"]
        BG_EXT("broker-gateway :8081<br/><small>API gateway client</small>"):::registry
        ANY("Any polyglot service<br/><small>Spring, Quarkus, Python, Go, ...</small>"):::registry
    end

    subgraph REG["Service Registry :8085"]
        direction TB

        subgraph REG_API["Registry API (external-facing)"]
            REG_EP("POST /api/registry/register"):::registry
            HB_EP("POST /api/registry/heartbeat/{name}"):::registry
            DISC_EP("GET /api/registry/services"):::registry
            OP_EP("GET /api/registry/services/by-operation/{op}"):::registry
            DETAIL_EP("GET /api/registry/services/{name}/details"):::registry
            DEREG_EP("POST /api/registry/deregister/{name}"):::registry
        end

        subgraph CRUD_API["Core CRUD (internal management)"]
            FW("/api/frameworks"):::registry
            SV("/api/services"):::registry
            SRV("/api/servers"):::registry
            DEP("/api/deployments"):::registry
            CFG("/api/configurations"):::registry
            BKD("/api/backends"):::registry
        end
    end

    subgraph ENTITIES["Data Model — 7 Core Entities"]
        direction TB
        E1("Framework<br/><small>name, vendor, category, language<br/>currentVersion, supportsBrokerPattern</small>"):::entity
        E2("Service<br/><small>name, framework, type, parentService<br/>defaultPort, repositoryUrl, status</small>"):::entity
        E3("Server<br/><small>hostname, ipAddress, type, environment<br/>cpuCores, memory, region</small>"):::entity
        E4("Deployment<br/><small>service, server, environment, port, status<br/>healthStatus, processId, containerName</small>"):::deploy
        E5("ServiceConfiguration<br/><small>configKey, configValue, environment<br/>isSecret (encrypted)</small>"):::config
        E6("ServiceDependency<br/><small>self-referential join table<br/>service → targetService</small>"):::entity
        E7("ServiceBackend<br/><small>serviceDeployment → backendDeployment<br/>role, priority, weight, routingKey</small>"):::backend
    end

    subgraph LOOKUP["Lookup Tables (9 total)"]
        L1("service_types"):::entity
        L2("environment_types"):::entity
        L3("operating_systems"):::entity
        L4("server_types"):::entity
        L5("framework_categories"):::entity
        L6("framework_languages"):::entity
        L7("service_config_types"):::entity
        L8("visual_components"):::entity
        L9("framework_vendors"):::entity
    end

    subgraph PG["PostgreSQL (registry schema)"]
        DB("registry.* tables"):::registry
    end

    subgraph CACHE["Redis (optional)"]
        REDIS_C("Caching layer<br/><small>real-time service status</small>"):::registry
    end

    %% ===== FLOWS =====
    ANY -->|"1. register"| REG_EP
    ANY -->|"2. heartbeat every Ns"| HB_EP
    BG_EXT -->|"3. discover by operation"| OP_EP
    BG_EXT -->|"4. get endpoint URL"| DETAIL_EP
    ANY -->|"5. deregister"| DEREG_EP

    REG_EP --> E2
    HB_EP --> E4
    DISC_EP --> E2
    OP_EP --> E2
    DETAIL_EP --> E2
    DEREG_EP --> E4

    E4 -->|"creates"| E7
    E2 -->|"depends on"| E6

    E1 --> DB
    E2 --> DB
    E3 --> DB
    E4 --> DB
    E5 --> DB
    E6 --> DB
    E7 --> DB

    DB -.->|"cached by"| REDIS_C
```

### Deployment Status Lifecycle

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '13px',
  'primaryBorderColor': '#555'
}}}%%

stateDiagram-v2
    [*] --> STOPPED: Created

    state STOPPED
    state STARTING
    state RUNNING
    state STOPPING
    state FAILED

    STOPPED --> STARTING: start()
    STARTING --> RUNNING: success
    STARTING --> FAILED: error

    RUNNING --> STOPPING: stop()
    RUNNING --> FAILED: crash
    RUNNING --> RUNNING: restart()

    STOPPING --> STOPPED: completed
    STOPPING --> FAILED: error

    FAILED --> STOPPED: reset()
```

### Health Status Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '13px'
}}}%%

stateDiagram-v2
    [*] --> UNKNOWN: deployed

    UNKNOWN --> HEALTHY: first health check passes
    UNKNOWN --> UNHEALTHY: first health check fails

    HEALTHY --> DEGRADED: partial failure
    HEALTHY --> UNHEALTHY: complete failure
    HEALTHY --> HEALTHY: all checks pass

    DEGRADED --> HEALTHY: recovery
    DEGRADED --> UNHEALTHY: complete failure
    DEGRADED --> DEGRADED: same partial state

    UNHEALTHY --> HEALTHY: full recovery
    UNHEALTHY --> DEGRADED: partial recovery
```

### Backend Connection Graph

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '13px',
  'primaryBorderColor': '#555'
}}}%%

graph LR
    classDef svc fill:#16213e,stroke:#0f3460,color:#ddd
    classDef dep fill:#1b4332,stroke:#2d6a4f,color:#ddd
    classDef role fill:#4a1942,stroke:#7b2d8e,color:#eee

    subgraph EX["Example: file-service Backends"]
        FS("file-service"):::svc
        FS_DEP1("Deployment 1<br/>localhost:8084"):::dep
        FS_DEP2("Deployment 2<br/>localhost:8094"):::dep
        FSS1("file-system-server<br/>localhost:4040"):::dep
        FSS2("file-system-server<br/>localhost:4041"):::dep
        FSS3("file-system-server<br/>localhost:4042"):::dep

        FS --> FS_DEP1
        FS --> FS_DEP2
        FS_DEP1 -->|"PRIMARY (priority:1)"| FSS1
        FS_DEP1 -->|"BACKUP (priority:2)"| FSS2
        FS_DEP2 -->|"PRIMARY (priority:1)"| FSS3
    end

    class FS,FS_DEP1,FS_DEP2,FSS1,FSS2,FSS3 dep

    NOTE("Backend Roles: PRIMARY, BACKUP, ARCHIVE,<br/>CACHE, SHARD, READ_REPLICA")
```

---

## 5. broker-gateway — Request Routing Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '13px',
  'primaryBorderColor': '#555'
}}}%%

graph TB
    %% ===== STYLES =====
    classDef client fill:#2d2d2d,stroke:#888,color:#ccc
    classDef gateway fill:#4a1942,stroke:#7b2d8e,color:#eee
    classDef disc fill:#16213e,stroke:#0f3460,color:#ddd
    classDef target fill:#1b4332,stroke:#2d6a4f,color:#ddd
    classDef profile fill:#1a0a2e,stroke:#9b59b6,color:#ddd

    subgraph CLIENT["Client"]
        C("HTTP Client<br/><small>OpenCode, curl, Angular UI</small>"):::client
    end

    subgraph BGATE["broker-gateway :8081"]
        direction TB

        subgraph PROFILES["Environment Profiles"]
            PROF_SEL("selenium<br/><small>connects to Beryllium FS<br/>172.16.30.57:4040</small>"):::profile
            PROF_BER("beryllium<br/><small>local FS server<br/>localhost:4040</small>"):::profile
            PROF_DEV("dev<br/><small>debug logging</small>"):::profile
        end

        subgraph CONFIG["Configuration Layer"]
            FEIGN("BrokerGatewayFeignConfig<br/><small>OpenFeign client setup</small>"):::gateway
            REST_T("RestTemplateConfig<br/><small>HTTP client pool</small>"):::gateway
            CORS("CorsFilter"):::gateway
            OPENAPI("OpenApiConfig"):::gateway
            REG_SVC("ServiceRegistryRegistrationService<br/><small>auto-registers with :8085</small>"):::gateway
        end

        subgraph ROUTING["Routing Layer"]
            HEALTH("HealthController<br/><small>GET /health</small>"):::gateway
            LOGS("BrokerLogsController<br/><small>traffic logging</small>"):::gateway
            BROKER("POST /api/broker/submitRequest<br/><small>{service, operation, requestId, params}</small>"):::gateway
            INVOKER("ExternalServiceInvokerImpl<br/><small>invokes target microservice</small>"):::gateway
            TRAFFIC("BrokerTrafficStreamService<br/><small>traffic observation/replay</small>"):::gateway
        end
    end

    subgraph DISCOVERY["Service Discovery"]
        SR("service-registry :8085"):::disc
        SD_CLIENT("ServiceDiscoveryClientImpl<br/><small>Feign → service-registry</small>"):::disc
    end

    subgraph TARGETS["Target Microservices"]
        US("user-service"):::target
        LS("login-service"):::target
        FS("file-service"):::target
        NS("note-service"):::target
        SS("search-service"):::target
    end

    %% ===== ROUTING FLOW =====
    C -->|"POST /api/broker/submitRequest"| BROKER
    BROKER -->|"1. identify target service"| SD_CLIENT
    SD_CLIENT -->|"2. GET /by-operation/{op}"| SR
    SR -->|"3. return endpoint"| SD_CLIENT
    SD_CLIENT -->|"4. resolved URL"| BROKER
    BROKER -->|"5. invoke"| INVOKER
    INVOKER -->|"6. route to"| TARGETS
    TARGETS -->|"7. response"| INVOKER
    INVOKER -->|"8. return ServiceResponse"| BROKER
    BROKER -->|"9. HTTP response"| C

    SD_CLIENT -.->|"discovers"| REG_SVC
```

### Request Format

```json
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

### Startup Sequence

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '12px'
}}}%%

sequenceDiagram
    participant BG as broker-gateway :8081
    participant SR as service-registry :8085
    participant TERR as terrain :8084
    participant PEB as peb-kernel :8080

    Note over TERR,PEB: JVM services start independently
    Note over SR: Seeds framework catalog

    BG->>SR: POST /api/registry/register (self)
    SR-->>BG: 200 OK (registered)
    Note over BG: ServiceRegistryRegistrationService

    BG->>SR: GET /api/registry/services/by-operation/loginService
    SR-->>BG: {endpoint, status, health}

    BG->>BG: Startup complete — accepting requests
    BG->>SR: POST /api/registry/heartbeat/broker-gateway (every Ns)

    TERR->>SR: POST /api/registry/register (topology data)
    PEB->>SR: POST /api/registry/register (peb-kernel)

    loop Health Check Loop
        SR->>BG: Check /health endpoint
        BG-->>SR: {status: "UP", details: {...}}
    end
```

---

## 6. Key Data Structures

### terrain — ServiceDependency (Polymorphic)

```
sourceType:   "McpServer" | "RunnableService" | "Server"
sourceId:     BIGINT (FK to respective table)
targetType:   "McpServer" | "RunnableService" | "Server"
targetId:     BIGINT (FK to respective table)
criticality:  "REQUIRED" | "OPTIONAL" | ...
description:  TEXT
```

### peb-kernel — PebDecision (Merkle Chain)

```
id:               BIGSERIAL
decisionId:       UUID
parentDecisionId: UUID (FK → peb_decision, null for genesis)
beforeHash:       VARCHAR(64) (SHA-256 of state before change)
afterHash:        VARCHAR(64) (SHA-256 of state after change)
changeType:       VARCHAR (state_mutation, invariant_check, governance)
capabilityToken:  VARCHAR (e.g., "cap:mutate_state:key=invariants")
actor:            VARCHAR (who requested this change)
payload:          JSONB (the actual state delta)
createdAt:        TIMESTAMPTZ
```

### service-registry — Deployment Status Flow

```
Status:    STOPPED → STARTING → RUNNING → STOPPING → STOPPED
                                                → FAILED
Health:    UNKNOWN → HEALTHY → DEGRADED → UNHEALTHY
```

### broker-gateway — ServiceRequest

```
{
  "service":    String,    // Target service name
  "operation":  String,    // Operation to execute
  "requestId":  String,    // Unique request identifier
  "params":     Object     // Operation parameters
}
```

---

*Sources: `jvm/spring/terrain/src/`, `jvm/spring/peb-kernel/`, `jvm/spring/service-broker/broker-gateway/src/`, `jvm/spring/service-registry/`, ARCHITECTURE.md.*
