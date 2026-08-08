# tackle-srv — Tackle Role Memory + Agent Orchestration

> Port: **3410**  
> REST reference: `API.md` · OpenAPI spec: [`openapi.yaml`](./openapi.yaml)

Tackle role memory and orchestration: AI config, sessions, roles, scheduler, memory, prompts, tool access, failure recovery, tasks, and logs.

**73 endpoints** — inventory generated from source route registrations (`nexus/tools/api-docs/`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config/ai` |  |
| POST | `/config/ai/bundle` |  |
| DELETE | `/config/ai/bundle/:id` |  |
| GET | `/config/ai/bundle/:id` |  |
| GET | `/config/ai/bundles` |  |
| GET | `/config/ai/bundles/:role` |  |
| POST | `/config/ai/bundles/:role` |  |
| POST | `/config/ai/harness` |  |
| DELETE | `/config/ai/harness/:id` |  |
| GET | `/config/ai/harness/:id` |  |
| GET | `/config/ai/harnesses` |  |
| POST | `/config/ai/import` |  |
| POST | `/config/ai/model` |  |
| DELETE | `/config/ai/model/:id` |  |
| GET | `/config/ai/model/:id` |  |
| GET | `/config/ai/models` |  |
| POST | `/config/ai/provider` |  |
| DELETE | `/config/ai/provider/:id` |  |
| GET | `/config/ai/provider/:id` |  |
| GET | `/config/ai/providers` |  |
| GET | `/config/ai/resolve/:role` |  |
| POST | `/config/ai/role` |  |
| DELETE | `/config/ai/role/:role` |  |
| GET | `/config/ai/role/:role` |  |
| GET | `/config/ai/roles` |  |
| POST | `/config/ai/seed-defaults` |  |
| POST | `/config/ai/test` |  |
| GET | `/config/ai/tool-access` |  |
| PATCH | `/config/ai/tool-access/:id` |  |
| GET | `/config/ai/tool-access/:role` |  |
| GET | `/config/ai/validate` |  |
| GET | `/config/failure-recovery` |  |
| POST | `/config/failure-recovery` |  |
| GET | `/health` |  |
| GET | `/health/history` | GET /health/history — time-series metrics |
| GET | `/health/metrics` | GET /health/metrics — current snapshot with full details |
| POST | `/health/simulate-load` | POST /health/simulate-load — no-op stub (live server has no load simulation) |
| DELETE | `/logs` | DELETE /logs — clear all logs |
| GET | `/logs` | GET /logs — query with optional filters |
| POST | `/logs/emit` | POST /logs/emit — insert a single log entry |
| POST | `/memory/check-since` |  |
| GET | `/memory/procedure/:slug` |  |
| GET | `/memory/procedures/:role` |  |
| POST | `/memory/refresh` |  |
| GET | `/memory/role-updates` |  |
| GET | `/projections` | Routes GET /projections — list all projection configs |
| POST | `/projections` | POST /projections — create new projection config |
| GET | `/projections/:id` | GET /projections/:id — get single projection config |
| PUT | `/projections/:id` | PUT /projections/:id — update projection config |
| POST | `/projections/:id/render` | POST /projections/:id/render — render a single projection |
| GET | `/projections/drift` | GET /projections/drift — compare on-disk sha vs last_sha256 for all enabled projections |
| POST | `/projections/render-all` | POST /projections/render-all — render all enabled projections |
| GET | `/prompts` |  |
| POST | `/prompts` |  |
| GET | `/prompts/:role` | GET /prompts/:role — list prompts for a role (wind-ui compat) |
| GET | `/prompts/:role/:slug` | GET /prompts/:role/:slug — single prompt by role+slug (wind-ui compat) |
| GET | `/roles` |  |
| POST | `/roles` |  |
| DELETE | `/roles/:id` |  |
| GET | `/roles/:id` |  |
| GET | `/scheduler` |  |
| POST | `/scheduler` |  |
| DELETE | `/scheduler/:id` |  |
| GET | `/scheduler/:id` |  |
| PATCH | `/scheduler/:id` |  |
| GET | `/scheduler/due` |  |
| GET | `/sessions` |  |
| POST | `/sessions/:sessionId/kill` |  |
| GET | `/tasks` |  |
| POST | `/tasks` |  |
| DELETE | `/tasks/:task_slug` |  |
| GET | `/tasks/:task_slug` |  |
| GET | `/tasks/inspector/dispatch` |  |

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json   # (vision-srv also refreshes from the live FastAPI spec)
```
