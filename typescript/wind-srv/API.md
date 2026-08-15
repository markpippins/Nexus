# wind-srv — Wind Workflow Schema API

> Port: **3300**  
> REST reference: `API.md` · OpenAPI spec: [`openapi.yaml`](./openapi.yaml)

REST API for the wind workflow schema: offices, titles, tasks, workflow graphs, runtime instances, tickets, and receipts.

**65 endpoints** — inventory generated from source route registrations (`nexus/tools/api-docs/`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/edges` | List edges for a version |
| POST | `/api/edges` | Create edge |
| DELETE | `/api/edges/:id` | Delete edge |
| GET | `/api/event-types` | List event types |
| POST | `/api/event-types` | Register a new event type |
| DELETE | `/api/event-types/:eventType` | Delete event type |
| GET | `/api/event-types/:eventType` | Get single event type |
| GET | `/api/events` | List events (with optional filters) |
| POST | `/api/events` | Create event |
| GET | `/api/events/:id` | Get single event |
| POST | `/api/events/poll` | Poll unconsumed events (FOR UPDATE SKIP LOCKED) |
| GET | `/api/instances` | List instances (optionally filter by status or workflow_id) |
| POST | `/api/instances` | Start a workflow instance Creates an instance and tickets for the entrypoint node(s) |
| GET | `/api/instances/:id` | Get instance by ID (with tickets) |
| POST | `/api/instances/:id/advance` | Advance — complete a ticket with an outcome, create next tickets This is the core workflow traversal step |
| POST | `/api/instances/:id/execute` | Execute — run the harness for a ticket's task |
| POST | `/api/instances/:id/pause` | Pause an instance |
| POST | `/api/instances/:id/resume` | Resume a paused instance |
| POST | `/api/instances/:id/run` | Run an instance to completion (loop: execute → advance → … until terminal). |
| POST | `/api/instances/:id/stop` | Stop (cancel) an instance |
| GET | `/api/nodes` | List nodes for a version |
| POST | `/api/nodes` | Create node |
| DELETE | `/api/nodes/:id` | Delete node |
| GET | `/api/nodes/:id` | Get node by ID |
| PUT | `/api/nodes/:id` | Update node |
| GET | `/api/offices` | List all offices |
| POST | `/api/offices` | Create office |
| DELETE | `/api/offices/:id` | Delete office (cascade deletes titles, tasks, outcomes) |
| GET | `/api/offices/:id` | Get office by ID |
| PUT | `/api/offices/:id` | Update office |
| GET | `/api/outcomes` | List outcomes for a task |
| POST | `/api/outcomes` | Create outcome |
| DELETE | `/api/outcomes/:id` | Delete outcome |
| GET | `/api/outcomes/:id` | Get outcome by ID |
| GET | `/api/receipts` | List receipts (optionally filter by ticket) |
| GET | `/api/receipts/:id` | Get receipt by ID |
| GET | `/api/tasks` | List tasks (optionally filter by office) |
| POST | `/api/tasks` | Create task |
| DELETE | `/api/tasks/:id` | Delete task |
| GET | `/api/tasks/:id` | Get task by ID (with outcomes) |
| PUT | `/api/tasks/:id` | Update task |
| GET | `/api/tickets` | List tickets (optionally filter by instance, status, or title) |
| GET | `/api/tickets/:id` | Get ticket by ID |
| POST | `/api/tickets/:id/cancel` | Cancel a ticket |
| PUT | `/api/tickets/:id/status` | Update ticket status (e.g., PENDING → IN_PROGRESS) |
| GET | `/api/titles` | List titles (optionally filter by office) |
| POST | `/api/titles` | Create title |
| DELETE | `/api/titles/:id` | Delete title |
| GET | `/api/titles/:id` | Get title by ID |
| PUT | `/api/titles/:id` | Update title |
| GET | `/api/v-roles` | List roles (from nebula.roles via wind.v_roles view) |
| GET | `/api/v-roles/:name` | Get role by name |
| GET | `/api/validate/:version_id` | Validate a workflow version's graph integrity Uses the v_workflow_graph_validation view |
| POST | `/api/validate/:version_id/structure` | Validate a workflow version has required structure Checks: at least one entrypoint, at least one terminal, no orphaned nodes |
| GET | `/api/versions` | List versions for a workflow |
| POST | `/api/versions` | Create version (auto-increments version_number) |
| DELETE | `/api/versions/:id` | Delete version |
| GET | `/api/versions/:id` | Get version by ID (with nodes and edges) |
| POST | `/api/versions/:id/activate` | Activate a version (deactivate all others for that workflow) |
| GET | `/api/workflows` | List all workflows |
| POST | `/api/workflows` | Create workflow |
| DELETE | `/api/workflows/:id` | Delete workflow |
| GET | `/api/workflows/:id` | Get workflow by ID (with versions) |
| PUT | `/api/workflows/:id` | Update workflow |
| GET | `/health` | Health check |

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json   # (vision-srv also refreshes from the live FastAPI spec)
```
