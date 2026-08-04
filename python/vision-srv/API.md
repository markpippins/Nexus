# vision-srv — LOSM REST API

> Port: **8003**  
> REST reference: `API.md` · OpenAPI spec: [`openapi.yaml`](./openapi.yaml)

FastAPI backend for the LOSM (Layered Operational State Machine): work requests, branches, artifacts, and DAG compilation/validation.

**13 endpoints** — inventory generated from source route registrations (`nexus/tools/api-docs/`).

> OpenAPI spec captured live from the service's /openapi.json (FastAPI-native, schema-complete); the table below is the source-route inventory.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/artifacts` |  |
| POST | `/api/artifacts` |  |
| GET | `/api/branches` |  |
| POST | `/api/branches` |  |
| GET | `/api/work-requests` |  |
| POST | `/api/work-requests` |  |
| DELETE | `/api/work-requests/{wr_id}` |  |
| GET | `/api/work-requests/{wr_id}` |  |
| PATCH | `/api/work-requests/{wr_id}` |  |
| GET | `/api/work-requests/{wr_id}/dag` |  |
| GET | `/api/work-requests/{wr_id}/dag/path/{target_wr_id}` |  |
| GET | `/api/work-requests/{wr_id}/dag/validate` |  |
| GET | `/health` |  |

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json   # (vision-srv also refreshes from the live FastAPI spec)
```
