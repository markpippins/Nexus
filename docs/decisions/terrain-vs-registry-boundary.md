# Terrain / Health Monitor / Registry — Ownership Boundaries

**Date:** 2026-07-23 (updated)
**Status:** Decision
**Supersedes:** 2026-07-15 terrain-vs-registry-only version

## The Three-Way Split

| Concern | Owner | Schema/Artifact | Why |
|---------|-------|-----------------|-----|
| **Infrastructure fixtures** | Terrain | `terrain.*` | Static, always-on, don't self-register. Physical topology. |
| **Liveness & connectivity** | Health Monitor | `dependency-monitor.sh`, `circuit-breaker.ts` | Detects UP/DOWN transitions, restarts dependents on recovery |
| **Application metadata** | Registry | `registry.*` | Dynamic catalog, heartbeat protocol, framework/deployment tracking |

## Terrain Owns

**Infrastructure fixtures — the physical/container substrate everything runs on.**

### What terrain knows

- **Servers** — physical machines (hostname, IP, OS, specs) in `terrain.servers`
- **Infrastructure services** — PostgreSQL, Redis, NATS, MongoDB, Docker daemon, Ollama. These are always-on fixtures that don't self-register.
- **Port allocation** — which port is assigned to which service across the fleet
- **Network topology** — which services are on which machines, how they connect
- **Broker profiles** — messaging/routing configurations in `terrain.broker_profiles`
- **Registry server profiles** — where registry-service instances live (`terrain.registry_server_profiles`)
- **CLI tools** — the 63 command-line utilities cataloged in `terrain.cli_tools`
- **MCP servers** — the 12 MCP server definitions in `terrain.mcp_servers` (transport, startup, health URLs)
- **Service dependencies** — the graph edges in `terrain.service_dependencies` (which service depends on which)

### What terrain does NOT own

- **Application heartbeat state** — that's registry-service (Redis TTL)
- **Liveness checking** — that's health-monitor
- **Service version/deployment history** — that's registry-service
- **Framework cataloging** — that's registry-service

### Terrain boundary rules

1. If it has a **physical presence** (host, container, port, process on disk), terrain catalogs it.
2. If it is **always expected to be running** (PostgreSQL, Redis, NATS), terrain owns the definition.
3. If it's a **one-time tool** invoked ad-hoc (CLI tools, mesh-register), terrain catalogs it.
4. Application services that self-register via heartbeat belong in **registry**, not terrain. Duplicates in `terrain.runnable_services` are legacy and being migrated out.

---

## Health Monitor Owns

**Liveness detection and recovery — knows what's UP vs DOWN and acts on transitions.**

### What the health monitor knows

- **Infrastructure health** — whether Redis, MongoDB, PostgreSQL, NATS are reachable (port checks, ping commands, Docker container checks)
- **System service health** — whether service-registry (8085), terrain (8084), cascade-srv (3106), peb-kernel (8080) are reachable (HTTP probes, port checks)
- **State persistence** — previous UP/DOWN state per monitored service (JSON file at `$XDG_RUNTIME_DIR/nexus-monitor/dependency-state.json`)
- **Dependency graph** — which systemd services depend on which infrastructure (e.g., `service-registry.service` depends on Redis + PostgreSQL)
- **Recovery actions** — when an infrastructure service transitions from DOWN→UP, restart all its dependent systemd services

### How it works (`nexus/bin/dependency-monitor.sh`)

```
┌──────────────────────┐
│  dependency-monitor  │  systemd timer every 30s
│       (bash)         │
└─────────┬────────────┘
          │
    For each monitored service:
    ┌──────────────────────────────────────┐
    │  1. Probe: port check → ping → curl  │
    │  2. Compare current vs previous state│
    │  3. DOWN→UP: restart dependents      │
    │  4. UP→DOWN: log warning             │
    │  5. Persist new state                │
    └──────────────────────────────────────┘
```

### Monitored services (8 registered)

| Key | Infrastructure | System Service |
|-----|---------------|----------------|
| redis | ✅ (port 6379) | |
| mongodb | ✅ (port 27017) | |
| postgresql | ✅ (port 5432) | |
| nats | ✅ (port 4222) | |
| service-registry | | ✅ (port 8085) |
| terrain | | ✅ (port 8084) |
| cascade-srv | | ✅ (port 3106) |
| peb-kernel | | ✅ (port 8080) |

### Recovery restart targets

| When this recovers… | Restart these systemd services… |
|--------------------|--------------------------------|
| Redis | service-registry, role-memory-srv, tackle-mcp, cascade-event-bridge, cascade-pg-bridge |
| MongoDB | broker-gateway |
| PostgreSQL | service-registry, broker-gateway, peb-kernel, nebula-srv, conduit-mcp, cpf-api, execution-srv, cascade-srv, vision-srv-py |
| NATS | cascade-kernel-subscriber, cascade-obs-subscriber, address-tts |
| Service-Registry | broker-gateway |
| Terrain | terrain-mcp, heartbeat-terrain |
| Cascade-srv | heartbeat-cascade-srv |
| PEB-kernel | heartbeat-peb-kernel |

### Additional health tooling

- **`nexus/bin/redis-health-monitor.sh`** — Redis-specific health watcher (predates unified monitor, may be legacy)
- **`nexus/bin/mongodb-health-monitor.sh`** — MongoDB-specific health watcher (predates unified monitor, may be legacy)
- **`nexus/typescript/utils/circuit-breaker.ts`** — TypeScript `HealthMonitor` class with circuit-breaker pattern for image-server (8081), secure-file-system-server (4040), broker-gateway (8081). 3-failure threshold, 30s reset, 10s monitoring interval. **Not deployed as a standalone service** — imported as a utility by other services.

### Health monitor boundary rules

1. It **checks** liveness but does **not** own the service definitions — those are in terrain (infrastructure) or registry (applications).
2. It **acts** on transitions (restarts dependents) but does **not** decide what is healthy — that's the service's own `/health` endpoint.
3. It **persists** state for transition detection but is **stateless across reboots** (state resets on first run after reboot).
4. It **targets systemd user services** only. System services are not in scope.
5. Adding a new monitored service means: (a) add a health check function, (b) define the dependent services array, (c) register it in the `_register_service` block.

---

## Registry-Service Owns

**Application service metadata — the dynamic catalog of what's running, what it does, and how healthy it is.**

### What registry knows

- **Application service catalog** — 37+ services in `registry.services`
- **Service types** — 19 types including MCP Server, Event Bus, Agent Service, Pipeline Orchestrator, Speech/TTS, Frontend Host, PG Extension
- **Framework tracking** — 62 frameworks across Java, Node, Python, Go, etc. (`registry.frameworks`)
- **Heartbeat protocol** — Redis-based stale detection via `POST /api/v1/registry/heartbeat/{name}`
- **Health state** — HEALTHY, UNHEALTHY, OFFLINE based on heartbeat TTL
- **Deployment tracking** — where services run, on which servers (`registry.deployments`)
- **Operation-based discovery** — `GET /api/registry/services/by-operation/{operation}`

### Heartbeat architecture

```
┌─────────────────┐     POST /heartbeat/{name}     ┌──────────────────┐
│  Application    │ ──────────────────────────────→ │ Service Registry │
│  Services       │                                  │  (port 8085)     │
│  (Python/TS)    │     ← heartbeat response         │                  │
└─────────────────┘                                  └────────┬─────────┘
                                                              │
                                                    stores in Redis
                                                    service:heartbeat:{name}
                                                              │
                                                    ┌────────▼─────────┐
                                                    │  3D Visualizer   │
                                                    │  (nexus-console) │
                                                    └──────────────────┘

┌─────────────────┐     NO heartbeat (always on)   ┌──────────────────┐
│  Infrastructure │ ──────────────────────────────→ │     Terrain      │
│  Services       │                                  │  (static catalog)│
│  PostgreSQL     │     cataloged, not monitored     │                  │
│  Redis, NATS    │                                  └──────────────────┘
└─────────────────┘

┌─────────────────┐     DOWN→UP transition         ┌──────────────────┐
│  Health Monitor │ ──────────────────────────────→ │    systemctl     │
│  (dependency-   │     restarts dependents          │   --user restart │
│   monitor.sh)   │                                  └──────────────────┘
└─────────────────┘
```

### Registry boundary rules

1. If a service **self-registers** (sends heartbeats), it belongs in registry.
2. If a service has a **framework** (Spring Boot, Express, FastAPI, etc.), registry tracks it.
3. If a service has a **version and deployment history**, registry tracks it.
4. Registry does **not** own infrastructure fixtures — those are terrain.
5. Registry does **not** own liveness polling — that's the health monitor. Registry tracks the *result* of heartbeats (HEALTHY/UNHEALTHY/OFFLINE), not the act of checking.

---

## The Overlap Problem (Legacy)

### Current state

- `terrain.runnable_services` (~27 entries) overlaps with `registry.services` (~37 entries)
- `terrain.service_dependencies` has 14 edges that should reference registry entities
- `terrain.mcp_servers` has 12 entries that are application services, not infrastructure
- `mesh-register.py` writes to `terrain.runnable_services` but should target `registry.services`

### Resolution plan

| Step | What | Status |
|------|------|--------|
| 1 | Populate `terrain.service_types` with expected constants | ✅ Done |
| 2 | Audit `terrain.*` for application vs infrastructure entries | ✅ Done (16 duplicates, 18 terrain-only app services, 5 true infrastructure) |
| 3 | Define three-way boundary (this document) | ✅ Done |
| 4 | Migrate 34 application entries from terrain to registry (16 deletes of duplicates already in registry + 18 inserts of terrain-only app services) | Pending |
| 5 | Update `mesh-register.py` to write to `registry.*` | Pending |
| 6 | Update terrain MCP tools to delegate app queries to registry | Pending |
| 7 | Drop application entries from `terrain.runnable_services` | Pending |

---

## Cross-Cutting Rules

1. **No service should be defined in two places.** If it's in registry.services, remove it from terrain.runnable_services.
2. **Health monitor checks everything but owns nothing.** It's a consumer of both terrain and registry data.
3. **Terrain is the source of truth for "where does this run?"** (host, port, container).
4. **Registry is the source of truth for "what is this and is it healthy?"** (type, framework, version, heartbeat state).
5. **When in doubt:** if it has a `/health` endpoint and sends heartbeats, it's a registry application. If it's a daemon expected to always be running on a fixed port with no self-registration, it's terrain infrastructure.
