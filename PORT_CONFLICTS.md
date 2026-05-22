# Port Conflicts Report

Generated: 2026-05-20
Status: All port reconciliations completed. Enforcement now driven by ARCHITECTURE.md.

## Current State

All services now match the desired port configuration defined in `ARCHITECTURE.md`. No active conflicts remain.

### Port Assignments (verified)

| Service | Port | Status |
|---------|------|--------|
| Spring Broker Gateway | 8081 | OK |
| Quarkus Broker Gateway | 8090 | OK |
| AdonisJS Broker Gateway Proxy | 8079 | OK |
| TypeScript Broker Gateway Proxy | 3333 | OK |
| TypeScript Broker Service Proxy | 3334 | OK |
| Mock Broker Service | 8099 | OK |
| File System Server | 4040 | OK |
| Google Search Proxy | 8082 | OK |
| Unsplash Proxy | 8083 | OK |
| User Access Service (Helidon) | 9093 | OK |
| Image Server | 9081 | OK |
| Moleculer Search | 4050 | OK |
| FS Crawler Backend | 8004 | OK |
| FS Crawler UI | 3004 | OK |
| Service Registry | 8085 | OK |

## Outstanding Issues

### Quarkus External Service References

Quarkus broker-gateway references ports that don't match actual services:
- `user-service=http://localhost:8083` — actual unsplash proxy is on 8083 (collision)
- `login-service=http://localhost:8082` — actual google search proxy is on 8082 (collision)
- `file-service=http://localhost:8081` — now Spring broker-gateway (not a file service)
- `search-service=http://localhost:8084` — no service on 8084

These are placeholder values that need to be reconciled with actual service topology.

## Enforcement

Port configuration is now enforced through `ARCHITECTURE.md`. The Inspector scans scoped projects (`jvm/**`, `typescript/**`) for compliance. Discrepancies are flagged in advisory mode.
