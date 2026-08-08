# role-memory-srv — Role Memory Procedure Registry

> Port: **3500**  
> REST reference: `API.md` · OpenAPI spec: [`openapi.yaml`](./openapi.yaml)

Role Memory Procedure Registry: procedure cards and indexes, with a PG→Redis refresh endpoint.

**4 endpoints** — inventory generated from source route registrations (`nexus/tools/api-docs/`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` |  |
| GET | `/procedure/:slug` |  |
| GET | `/procedures/:role` |  |
| POST | `/refresh` |  |

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json   # (vision-srv also refreshes from the live FastAPI spec)
```
