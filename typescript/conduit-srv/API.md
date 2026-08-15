# conduit-srv — WorkRequest Pipeline Orchestrator (REST surface)

> Port: **3104**  
> REST reference: `API.md` · OpenAPI spec: [`openapi.yaml`](./openapi.yaml)

REST surface of the conduit pipeline orchestrator: workflows, tickets, tokens, config (cron, failure-recovery), governance (replay, events), vision, and session log. The MCP tool surface is served separately (Streamable HTTP JSON-RPC on the same port).

**20 endpoints** — inventory generated from source route registrations (`nexus/tools/api-docs/`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` |  |
| GET | `/config/cron` | GET /config/cron — pipeline cron interval |
| GET | `/config/failure-recovery` | GET /config/failure-recovery — from circuit_breaker row |
| POST | `/config/failure-recovery` | POST /config/failure-recovery — save failure recovery config |
| GET | `/governance/events` | GET /governance/events — list governance events with optional filters |
| POST | `/governance/replay` | POST /governance/replay — replay historical receipts into peb.governance_events |
| GET | `/health` |  |
| GET | `/log/:sessionId` |  |
| POST | `/tickets/detect` | POST /tickets/detect — detect stale and expired tickets |
| GET | `/tickets/lineage/:planId` | GET /tickets/lineage/:planId — ticket audit trail for a plan |
| GET | `/tokens/plan/:planId` | GET /tokens/plan/:planId |
| GET | `/tokens/role/:role` | GET /tokens/role/:role |
| GET | `/tokens/ticket/:ticketId` | GET /tokens/ticket/:ticketId |
| GET | `/vision/receipts` | GET /vision/receipts — list receipts for a plan |
| GET | `/vision/work-requests` | GET /vision/work-requests — list work requests with optional filters |
| POST | `/vision/work-requests` | POST /vision/work-requests — create or upsert a work request |
| GET | `/vision/work-requests/:id` | GET /vision/work-requests/:id — get a single work request |
| GET | `/workflows` |  |
| GET | `/wr/:id/projection-drift` |  |
| GET | `/wr/drift-scan` |  |

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json   # (vision-srv also refreshes from the live FastAPI spec)
```
