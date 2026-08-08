# cascade-srv — Event Query API

> Port: **3106**  
> REST reference: `API.md` · OpenAPI spec: [`openapi.yaml`](./openapi.yaml)

Query service over the cascade event model: events with filtering, pagination and time-range aggregation, assessments, analytics.

**12 endpoints** — inventory generated from source route registrations (`nexus/tools/api-docs/`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Root health check |
| GET | `/cascade/analytics` | GET /analytics Aggregated event metrics for dashboards. |
| GET | `/cascade/assessments` | GET /assessments Assessment resolutions — how cascade assessors resolved events. |
| GET | `/cascade/events` | GET /events List events with filtering, pagination, and optional time-range aggregation. |
| GET | `/cascade/events/:id` | GET /events/:id Single event detail. |
| GET | `/cascade/events/:id/children` | GET /events/:id/children What events did this one trigger? (causation_id pointing back to this event) |
| GET | `/cascade/events/:id/lineage` | GET /events/:id/lineage Walk the causation chain backward (what triggered this event). |
| GET | `/cascade/health` | GET /health |
| GET | `/cascade/lineage` | GET /lineage Graph-style lineage query: nodes + edges between events. |
| GET | `/cascade/subscribers` | GET /subscribers List registered subscribers with their processing offsets. |
| GET | `/cascade/subscribers/:pattern` | GET /subscribers/:pattern Get a single subscriber by subject_pattern. |
| PATCH | `/cascade/subscribers/:pattern` | PATCH /subscribers/:pattern Update subscriber config (enable/disable). |

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json   # (vision-srv also refreshes from the live FastAPI spec)
```
