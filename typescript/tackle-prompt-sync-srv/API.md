# tackle-prompt-sync-srv — Prompt + Task Registry Sync

> Port: **3501**  
> REST reference: `API.md` · OpenAPI spec: [`openapi.yaml`](./openapi.yaml)

Reads prompt templates and active tasks from PostgreSQL and populates the Redis prompt:* / task:* caches for live agents.

**5 endpoints** — inventory generated from source route registrations (`nexus/tools/api-docs/`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` |  |
| GET | `/prompt/:role/:slug` |  |
| GET | `/prompts/:role` |  |
| POST | `/refresh` |  |
| GET | `/tasks/:role` |  |

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json   # (vision-srv also refreshes from the live FastAPI spec)
```
