# harness-srv — Generic Execution Harness

> Port: **3420**  
> REST reference: `API.md` · OpenAPI spec: [`openapi.yaml`](./openapi.yaml)

Merges Tackle role context (prompt + tool ACL + procedure cards) with Wind task context (inputs + acceptance criteria) and invokes an agent via the configured harness.

**5 endpoints** — inventory generated from source route registrations (`nexus/tools/api-docs/`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` |  |
| POST | `/resolve-context` |  |
| POST | `/run` |  |
| POST | `/run-direct` |  |
| GET | `/sessions` | GET /sessions — active session list (runaway watchdog visibility) |

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json   # (vision-srv also refreshes from the live FastAPI spec)
```
