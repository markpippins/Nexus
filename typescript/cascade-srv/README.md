# cascade-srv — Event Query API

> **Port:** 3106
> **Base URL:** `http://localhost:3106`
> **Health:** `GET http://localhost:3106/cascade/health`
> **Docs:** [`API.md`](./API.md) (endpoint inventory) · [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.0)

Read-side query service over the **cascade event model** (PostgreSQL). It serves
event history with filtering, pagination and time-range aggregation, causation
lineage (what triggered what), subscriber configuration, and dashboard
analytics. Writes happen through the pipeline (e.g. `peb`), not here — this
service is read-oriented.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Root health check |
| GET | `/cascade/events` | List events with filtering, pagination, and optional time-range aggregation |
| GET | `/cascade/events/:id` | Single event detail |
| GET | `/cascade/events/:id/children` | What events did this one trigger? (causation) |
| GET | `/cascade/events/:id/lineage` | Walk the causation chain backward (what triggered this) |
| GET | `/cascade/lineage` | Graph-style lineage query: nodes + edges between events |
| GET | `/cascade/analytics` | Aggregated event metrics for dashboards |
| GET | `/cascade/assessments` | Assessment resolutions — how cascade assessors resolved events |
| GET | `/cascade/subscribers` | List registered subscribers with their processing offsets |
| GET | `/cascade/subscribers/:pattern` | Get a single subscriber by subject_pattern |
| PATCH | `/cascade/subscribers/:pattern` | Update subscriber config (enable/disable) |
| GET | `/cascade/health` | Health check |

Full inventory with descriptions: [`API.md`](./API.md) · machine-readable: [`openapi.yaml`](./openapi.yaml).

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json \
  && python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json
```
