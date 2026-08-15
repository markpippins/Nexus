# wind-srv API Specification

**Port:** 3300  
**Base URL:** `http://localhost:3300/api`

REST API for the wind workflow schema. Provides CRUD for workflow definitions and runtime operations for workflow execution.

---

## Health

### `GET /health`
Returns service health status.

```json
{ "ok": true, "schema": "wind" }
```

---

## Offices

### `GET /api/offices`
List all offices.

### `GET /api/offices/:id`
Get office by ID.

### `POST /api/offices`
Create office.
```json
{ "name": "string", "description": "string?" }
```

### `PUT /api/offices/:id`
Update office.

### `DELETE /api/offices/:id`
Delete office (cascades to titles, tasks, outcomes).

---

## Titles

### `GET /api/titles?office_id=uuid`
List titles. Optionally filter by office. Includes `office_name` and `role_name` from joins.

### `GET /api/titles/:id`
Get title by ID.

### `POST /api/titles`
Create title. References `nebula.roles(id)` via `role_id`.
```json
{ "office_id": "uuid", "role_id": "uuid", "display_name": "string" }
```

### `PUT /api/titles/:id`
Update title (role_id, display_name).

### `DELETE /api/titles/:id`
Delete title.

---

## Tasks

### `GET /api/tasks?office_id=uuid`
List tasks. Optionally filter by office.

### `GET /api/tasks/:id`
Get task by ID, including all outcomes.

### `POST /api/tasks`
Create task.
```json
{ "office_id": "uuid", "title_id": "uuid", "name": "string", "description": "string?", "input_spec": {} }
```

### `PUT /api/tasks/:id`
Update task (name, description, input_spec).

### `DELETE /api/tasks/:id`
Delete task (cascades to outcomes).

---

## Outcomes

### `GET /api/outcomes?task_id=uuid`
List outcomes for a task.

### `GET /api/outcomes/:id`
Get outcome by ID.

### `POST /api/outcomes`
Create outcome.
```json
{ "task_id": "uuid", "code": "string", "description": "string?", "output_spec": {} }
```

### `DELETE /api/outcomes/:id`
Delete outcome.

---

## Workflows

### `GET /api/workflows`
List all workflows with version count and active version.

### `GET /api/workflows/:id`
Get workflow by ID with all versions.

### `POST /api/workflows`
Create workflow.
```json
{ "name": "string", "description": "string?" }
```

### `PUT /api/workflows/:id`
Update workflow (name, description).

### `DELETE /api/workflows/:id`
Delete workflow (cascades to versions, nodes, edges).

---

## Versions

### `GET /api/versions?workflow_id=uuid`
List versions for a workflow.

### `GET /api/versions/:id`
Get version by ID with all nodes and edges.

### `POST /api/versions`
Create version (auto-increments version_number).
```json
{ "workflow_id": "uuid" }
```

### `POST /api/versions/:id/activate`
Activate a version (deactivates all others for the workflow).

### `DELETE /api/versions/:id`
Delete version (cascades to nodes, edges).

---

## Nodes

### `GET /api/nodes?version_id=uuid`
List nodes for a version.

### `GET /api/nodes/:id`
Get node by ID with task input_spec.

### `POST /api/nodes`
Create node.
```json
{ "workflow_version_id": "uuid", "task_id": "uuid", "name": "string", "is_entrypoint": false, "is_terminal": false }
```

### `PUT /api/nodes/:id`
Update node (name, is_entrypoint, is_terminal).

### `DELETE /api/nodes/:id`
Delete node (cascades to edges).

---

## Edges

### `GET /api/edges?version_id=uuid`
List edges for a version.

### `POST /api/edges`
Create edge.
```json
{ "workflow_version_id": "uuid", "from_node_id": "uuid", "from_task_id": "uuid", "outcome_id": "uuid", "to_node_id": "uuid" }
```

### `DELETE /api/edges/:id`
Delete edge.

---

## Instances (Runtime)

### `GET /api/instances?status=ACTIVE&workflow_id=uuid`
List instances. Filter by status and/or workflow.

### `GET /api/instances/:id`
Get instance by ID with all tickets.

### `POST /api/instances`
**Start** a workflow instance. Creates instance + tickets for entrypoint node(s).
```json
{ "workflow_version_id": "uuid" }
```

### `POST /api/instances/:id/pause`
**Pause** an active instance.

### `POST /api/instances/:id/resume`
**Resume** a paused instance.

### `POST /api/instances/:id/stop`
**Stop** (cancel) an active or paused instance.

### `POST /api/instances/:id/advance`
**Advance** the workflow by completing a ticket with an outcome. Creates receipt + downstream tickets.
```json
{ "ticket_id": "uuid", "outcome_id": "uuid" }
```

This is the core traversal step. It:
1. Validates the ticket belongs to this instance and is completable
2. Validates the outcome belongs to the ticket's task
3. Marks the ticket COMPLETED
4. Creates a receipt
5. Finds outgoing edges for the node+outcome
6. Creates tickets for downstream nodes
7. If no downstream edges and node is terminal, marks instance COMPLETED

### `POST /api/instances/:id/execute`
**Execute** — run the harness for a ticket's task. Marks the ticket `IN_PROGRESS`, calls harness-srv, and records the outcome.

```json
{ "ticket_id": "uuid", "context": {} }
```

### `POST /api/instances/:id/run`
**Run** an instance to completion — loops `execute → advance → execute → …` until no `PENDING` tickets remain or the instance is `COMPLETED`. Returns the full execution log.

```json
{ "max_steps": 10, "timeout_ms": 120000 }
```

---

## Tickets

### `GET /api/tickets?instance_id=uuid&status=PENDING&title_id=uuid`
List tickets with optional filters.

### `GET /api/tickets/:id`
Get ticket by ID.

### `PUT /api/tickets/:id/status`
Update ticket status.
```json
{ "status": "IN_PROGRESS" }
```

### `POST /api/tickets/:id/cancel`
Cancel a pending or in-progress ticket.

---

## Receipts

### `GET /api/receipts?ticket_id=uuid`
List receipts. Includes `outcome_code` and `task_name`.

### `GET /api/receipts/:id`
Get receipt by ID.

---

## Validate

### `GET /api/validate/:version_id`
Validate a workflow version's graph integrity using `v_workflow_graph_validation`. Returns unhandled outcomes, unreachable nodes, and data contract mismatches.

```json
{
  "version_id": "uuid",
  "valid": true,
  "issue_count": 0,
  "issues": []
}
```

### `POST /api/validate/:version_id/structure`
Structural validation: exactly one entrypoint, at least one terminal, all non-terminal nodes have outgoing edges.

```json
{
  "version_id": "uuid",
  "valid": true,
  "checks": [
    { "check": "has_entrypoint", "pass": true, "detail": "OK" },
    { "check": "has_terminal", "pass": true, "detail": "1 terminal node(s)" },
    { "check": "non_terminal_has_edges", "pass": true, "detail": "OK" }
  ]
}
```

---

## V-Roles

### `GET /api/v-roles`
List all roles from `wind.v_roles` (view over `nebula.roles`).

### `GET /api/v-roles/:name`
Get role by name.

---

## Events

### `GET /api/events?event_type=&consumed=&limit=50`
List events. Filter by `event_type` and consumption state (`consumed=false` → unconsumed, `consumed=true` → consumed); `limit` caps rows (default 50).

### `GET /api/events/:id`
Get single event by ID.

### `POST /api/events`
Create an event. Broadcasts to NATS for real-time subscribers.

```json
{ "event_type": "string", "subject": "string?", "payload": {}, "source": "string?" }
```

### `POST /api/events/poll`
Poll unconsumed events (`FOR UPDATE SKIP LOCKED`) — claim up to `limit` (default 10, max 100) oldest unconsumed events atomically.

```json
{ "limit": 10 }
```

---

## Event Types

### `GET /api/event-types`
List all event types (joins workflow name).

### `GET /api/event-types/:eventType`
Get single event type by name.

### `POST /api/event-types`
Register a new event type.

```json
{
  "event_type": "string",
  "description": "string?",
  "schema": {},
  "workflow_id": "uuid?",
  "dedup_key_template": "string?",
  "enabled": true
}
```

### `DELETE /api/event-types/:eventType`
Delete an event type by name.

```json
{ "deleted": "string" }
```
