# conduit-srv — WorkRequest Pipeline Orchestrator (REST surface)

> **Port:** 3104
> **Base URL:** `http://localhost:3104`
> **Health:** `GET http://localhost:3104/health`
> **Docs:** [`API.md`](./API.md) (endpoint inventory) · [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.0)

`conduit-srv` is the **REST surface** of the WorkRequest pipeline orchestrator.
It exposes operational endpoints for the pipeline's supporting systems:

- **Workflows** — pipeline workflow definitions
- **Tickets** — stale/expired ticket detection and per-plan ticket lineage
- **Tokens** — per-plan / per-role / per-ticket conduit tokens
- **Config** — pipeline cron interval and failure-recovery (circuit breaker) config
- **Governance** — governance-event listing and replay of historical receipts into `peb.governance`
- **Vision** — work-request and receipt views over the LOSM (vision) schema
- **Log** — per-session session log retrieval

> **Note:** the MCP tool surface (plan creation, WorkRequest emission, etc.)
> is a separate Streamable-HTTP JSON-RPC server (`conduit-mcp`, port 3100).
> This service hosts the REST endpoints only.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service root |
| GET | `/health` | Health check |
| GET | `/workflows` | List pipeline workflows |
| POST | `/tickets/detect` | Detect stale and expired tickets |
| GET | `/tickets/lineage/:planId` | Ticket audit trail for a plan |
| GET | `/tokens/plan/:planId` | Tokens for a plan |
| GET | `/tokens/role/:role` | Tokens for a role |
| GET | `/tokens/ticket/:ticketId` | Tokens for a ticket |
| GET | `/config/cron` | Pipeline cron interval |
| GET | `/config/failure-recovery` | Failure-recovery config (from circuit_breaker row) |
| POST | `/config/failure-recovery` | Save failure recovery config |
| GET | `/governance/events` | List governance events with optional filters |
| POST | `/governance/replay` | Replay historical receipts into peb.governance |
| GET | `/vision/work-requests` | List work requests with optional filters |
| POST | `/vision/work-requests` | Create or upsert a work request |
| GET | `/vision/work-requests/:id` | Get a single work request |
| GET | `/vision/receipts` | List receipts for a plan |
| GET | `/log/:sessionId` | Session log for a session |

Full inventory with descriptions: [`API.md`](./API.md) · machine-readable: [`openapi.yaml`](./openapi.yaml).

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json \
  && python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json
```
