# voyager-srv — Filesystem / Entity Voyager API

> **Port:** 3114
> **Base URL:** `http://localhost:3114/api`
> **Health:** `GET http://localhost:3114/health`
> **Docs:** [`API.md`](./API.md) (endpoint inventory) · [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.0)

Read-side API over the **voyager** schema — the filesystem/entity observation
model. Serves scan epochs, file/directory observations, topology signals and
edge hints, identity candidates, entities (with drift history), metadata
spans, requirement candidates, and stats. All routes are read-only.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/scan-epochs` | List scan epochs (most recent first) |
| GET | `/api/scan-epochs/:id` | Single scan epoch |
| GET | `/api/observations/files` | List file observations |
| GET | `/api/observations/files/:id` | Single file observation by surrogate id |
| GET | `/api/observations/files/by-id/:observationId` | Lookup by observation UUID |
| GET | `/api/observations/directories` | List directory observations |
| GET | `/api/topology/signals` | List topology signals |
| GET | `/api/topology/signals/:id` | Single topology signal |
| GET | `/api/topology/edge-hints` | List observation edge hints |
| GET | `/api/identity/candidates` | List identity candidates |
| GET | `/api/entities` | List entities |
| GET | `/api/entities/:id` | Single entity with drift history |
| GET | `/api/entities/by-id/:entityId` | Lookup by entity UUID |
| GET | `/api/spans` | List metadata spans (paginated, filterable) |
| GET | `/api/spans/:id` | Single metadata span |
| GET | `/api/requirements` | List requirement candidates |
| GET | `/api/stats` | Observation/topology stats |
| GET | `/health` | Health check |

Full inventory with descriptions: [`API.md`](./API.md) · machine-readable: [`openapi.yaml`](./openapi.yaml).

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json \
  && python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json
```
