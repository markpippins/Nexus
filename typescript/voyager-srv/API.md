# voyager-srv — Filesystem / Entity Voyager API

> Port: **3114**  
> REST reference: `API.md` · OpenAPI spec: [`openapi.yaml`](./openapi.yaml)

Voyager over filesystems and entities: scan epochs, file/directory observations, topology signals and edge hints, identity candidates, entities, spans, requirements, and stats.

**19 endpoints** — inventory generated from source route registrations (`nexus/tools/api-docs/`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/entities` | ENTITIES GET /api/entities — list entities |
| GET | `/api/entities/:id` | GET /api/entities/:id — single entity with drift history |
| GET | `/api/entities/by-id/:entityId` | GET /api/entities/by-id/:entityId — lookup by entity_id (UUID) NOTE: must be declared BEFORE /:id to avoid route collision |
| GET | `/api/health` |  |
| GET | `/api/identity/candidates` | IDENTITY CANDIDATES GET /api/identity/candidates — list identity candidates |
| GET | `/api/observations/directories` | DIRECTORY OBSERVATIONS GET /api/observations/directories — list directory observations |
| GET | `/api/observations/files` | FILE OBSERVATIONS GET /api/observations/files — list file observations (paginated, filterable) |
| GET | `/api/observations/files/:id` | GET /api/observations/files/:id — single file observation by surrogate id |
| GET | `/api/observations/files/by-id/:observationId` | GET /api/observations/files/by-id/:observationId — lookup by observation_id (UUID) NOTE: must be declared BEFORE /:id to avoid route collision |
| GET | `/api/requirements` | REQUIREMENT CANDIDATES GET /api/requirements — list requirement candidates (LOSM output) |
| GET | `/api/scan-epochs` | SCAN EPOCHS GET /api/scan-epochs — list scan epochs (most recent first) |
| GET | `/api/scan-epochs/:id` | GET /api/scan-epochs/:id — single scan epoch |
| GET | `/api/spans` | METADATA SPANS GET /api/spans — list metadata spans (paginated, filterable) |
| GET | `/api/spans/:id` | GET /api/spans/:id — single metadata span |
| GET | `/api/stats` |  |
| GET | `/api/topology/edge-hints` | OBSERVATION EDGE HINTS GET /api/topology/edge-hints — list observation edge hints |
| GET | `/api/topology/signals` | TOPOLOGY SIGNALS GET /api/topology/signals — list topology signals |
| GET | `/api/topology/signals/:id` | GET /api/topology/signals/:id |
| GET | `/health` |  |

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json   # (vision-srv also refreshes from the live FastAPI spec)
```
