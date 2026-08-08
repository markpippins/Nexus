# knowledge-srv — Knowledge Graph REST API

> **Port:** 3109
> **Base URL:** `http://localhost:3109`
> **Health:** `GET http://localhost:3109/health`
> **Docs:** [`API.md`](./API.md) (endpoint inventory) · [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.0)

Read-side REST surface over the **knowledge graph** (`graph_entities`,
`graph_edges`, `graph_cross_references`, `graph_migrations` in PostgreSQL):
query entities by section, traverse relation edges, read cross-references and
migrations, and fetch summary counts.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Root health check |
| GET | `/health` | Health check |
| GET | `/knowledge/entities` | List entities (`?section=&entity_type=&status=`) |
| GET | `/knowledge/entities/:section/:entity_id` | Single entity by section + id |
| GET | `/knowledge/entities/:section/:entity_id/relations` | Relations of a single entity |
| GET | `/knowledge/edges` | List graph edges (`?source_section=&source_id=&target_section=&target_id=`) |
| GET | `/knowledge/cross-references` | List cross-references (`?map_name=&source=&target=`) |
| GET | `/knowledge/migrations` | List migrations (`?limit=`) |
| GET | `/knowledge/summary` | Summary counts (entities, edges, cross-references, migrations) |

Full inventory with descriptions: [`API.md`](./API.md) · machine-readable: [`openapi.yaml`](./openapi.yaml).

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json \
  && python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json
```
