# knowledge-srv — Knowledge Graph REST API

> Port: **3109**  
> REST reference: `API.md` · OpenAPI spec: [`openapi.yaml`](./openapi.yaml)

Knowledge graph surface: entities by section, relation edges, cross-references, migrations, and summary.

**9 endpoints** — inventory generated from source route registrations (`nexus/tools/api-docs/`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Root health check |
| GET | `/health` |  |
| GET | `/knowledge/cross-references` | graph_cross_references GET /knowledge/cross-references?map_name=&source_section=&target_id=&limit=&offset= |
| GET | `/knowledge/edges` | graph_edges GET /knowledge/edges?source_section=&source_id=&target_section=&target_id=&relation_type=&limit=&offset= |
| GET | `/knowledge/entities` | graph_entities GET /knowledge/entities?section=&entity_type=&status=&search=&limit=&offset= |
| GET | `/knowledge/entities/:section/:entity_id` | GET /knowledge/entities/:section/:entity_id |
| GET | `/knowledge/entities/:section/:entity_id/relations` | GET /knowledge/entities/:section/:entity_id/relations |
| GET | `/knowledge/migrations` | graph_migrations GET /knowledge/migrations?limit= |
| GET | `/knowledge/summary` | summary GET /knowledge/summary |

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json   # (vision-srv also refreshes from the live FastAPI spec)
```
