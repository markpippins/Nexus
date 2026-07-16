# Terrain vs Registry — Architectural Boundary

**Date:** 2026-07-15
**Status:** Decision

## The Split

| Concern | Owner | Schema | Why |
|---------|-------|--------|-----|
| **Infrastructure fixtures** | Terrain | `terrain.*` | Static, always-on, don't self-register |
| **Application services** | Registry | `registry.*` | Dynamic, may go down, need heartbeat detection |

## Terrain Owns

- **Servers** — physical machines (hostname, IP, OS, specs)
- **Infrastructure services** — PostgreSQL, Redis, NATS, MongoDB, Docker daemon, Ollama
- **Port allocation** — who owns what port across the fleet
- **Network topology** — which services are on which machines
- **Startup scripts** — how to bring up/tear down infrastructure
- **CLI tools** — the 63 command-line utilities cataloged in `terrain.cli_tools`
- **MCP servers** — the 12 MCP server definitions in `terrain.mcp_servers`
- **Broker profiles** — messaging patterns

## Registry Owns

- **Application service catalog** — the 37 services in `registry.services`
- **Service types** — 19 types including MCP Server, Event Bus, Agent Service, Pipeline Orchestrator, Speech/TTS, Frontend Host, PG Extension
- **Framework tracking** — 62 frameworks across Java, Node, Python, Go, etc.
- **Heartbeat protocol** — Redis-based stale detection via `POST /api/v1/registry/heartbeat/{name}`
- **Health state** — HEALTHY, UNHEALTHY, OFFLINE based on heartbeat TTL
- **Deployment tracking** — where services run, on which servers

## The Overlap (Current State)

`terrain.runnable_services` (27 entries) overlaps with `registry.services` (37 entries). Both contain application services like `nebula-srv`, `cascade-ui`, etc.

**Resolution:** The `runnable_services` table should be migrated to contain ONLY infrastructure services. Application services should live exclusively in `registry.services`. The terrain MCP tools (`terrain_list_runnable_services`, `terrain_get_service_status`, `terrain_is_running`) should be updated to:
- Query `terrain.runnable_services` for infrastructure (PostgreSQL, Redis, NATS, etc.)
- Query `registry.services` for application services (or delegate to service-registry)

This is a future migration. For now, both tables coexist.

## Heartbeat Architecture

```
┌─────────────────┐     POST /heartbeat/{name}     ┌──────────────────┐
│  Application    │ ──────────────────────────────→  │ Service Registry │
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

┌─────────────────┐     no heartbeat (always on)    ┌──────────────────┐
│  Infrastructure │ ──────────────────────────────→  │     Terrain      │
│  Services       │                                  │  (static catalog)│
│  PostgreSQL     │     health_check_url polling      │                  │
│  Redis, NATS    │                                  └──────────────────┘
└─────────────────┘
```
