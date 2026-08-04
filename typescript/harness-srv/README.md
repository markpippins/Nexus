# harness-srv — Generic Execution Harness

> **Port:** 3420
> **Base URL:** `http://localhost:3420`
> **Health:** `GET http://localhost:3420/health`
> **Docs:** [`API.md`](./API.md) (endpoint inventory) · [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.0)

Generic execution harness. Merges **Tackle role context** (prompt + tool ACL +
procedure cards) with **Wind task context** (inputs + acceptance criteria) and
invokes an agent via the configured harness.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/run` | Resolve context + execute agent |
| POST | `/resolve-context` | Resolve context only (dry run) |
| GET | `/health` | Health check |

Full inventory: [`API.md`](./API.md) · machine-readable: [`openapi.yaml`](./openapi.yaml).

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json \
  && python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json
```
