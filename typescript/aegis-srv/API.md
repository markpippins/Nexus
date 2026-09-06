# aegis-srv — Aegis State-Machine Registry API

> **Port:** `3116` (overridable via `AEGIS_SRV_PORT`) · Base path: `/api` · Health: `/health`
> OpenAPI spec: [`openapi.yaml`](./openapi.yaml)

REST API for the `aegis` schema: TLA+ state-machine **registries** and their child resources (constants, variables, states, transitions, invariants, properties, temporal properties, resolution-schema mappings, execution log), plus **validation** and **model-check** action endpoints.

All child resources are **registry-scoped**: every child route is namespaced under `/api/registries/:id/<resource>` where `:id` is the parent registry UUID. Every `:id` and `:cid` path parameter is a UUID (RFC 4122); non-UUID ids are rejected with `400`.

---

## Conventions

### Envelopes

| Case | Shape |
|------|-------|
| List (multiple rows) | `{ "items": [ <row>, ... ] }` |
| Create / single get / update | the **row object** directly |
| Delete | `{ "deleted": "<id>" }` |
| Error | `{ "error": "<short code-ish message>", "message": "<detail>" }` |

- Create returns `201 Created` with the full created row (`RETURNING *`).
- Update (`PATCH`) returns the updated row.
- Registry delete is a **soft delete**: sets `is_active = false` (a partial unique index enforces one active registry per `name`). The row remains in the table.

### Error mapping (`pgError`)

| HTTP | Condition |
|------|-----------|
| `400` | invalid UUID, no fields provided, foreign-key violation, check-constraint violation, invalid value (`22P02`) |
| `404` | registry or child row not found |
| `409` | unique-key / duplicate violation (`23505`) |
| `500` | unexpected DB / server error (also `{"error":"not found"}` for unknown routes, `{"error":"internal server error"}` from the error handler) |

### JSONB columns

Columns `metadata, value, initial_value, domain, variable_assignments, action, default_value, trace, errors, warnings, suggestions, context` are stored as **JSONB**. Send any JSON value (object / array / scalar); the server stringifies as needed. In responses these come back as JSON.

---

## Health

### `GET /health`
Liveness probe.

**Response `200`**
```json
{ "ok": true, "service": "aegis-srv" }
```

---

## Registries (root CRUD)

Registry writable columns: `name, description, version, tla_plus_source, tla_plus_module, metadata, tags, is_active, expires_at, main_concept_id`.

### `GET /api/registries`
List all registries (ordered by `created_at`).

**Response `200`** — `{ "items": [ ...registry rows ] }`

### `GET /api/registries/name/:name`
Get the active registry by `name` (`is_active = true`).

**Response `200`** — registry row · **`404`** `{ "error": "registry not found", ... }` if no active registry matches.

### `POST /api/registries`
Create a registry. Body: any subset of the writable columns.

**Request body (all optional, at least one required)**
```json
{
  "name": "string",
  "description": "string",
  "version": "string",
  "tla_plus_source": "string (TLA+ module text)",
  "tla_plus_module": "string",
  "metadata": { },
  "tags": ["string"],
  "is_active": true,
  "expires_at": "ISO-8601",
  "main_concept_id": "uuid"
}
```
**Response `201`** — created registry row · **`400`** `{ "error": "no fields provided" }` on empty body.

### `GET /api/registries/:id`
Get a registry by UUID.

**Response `200`** — registry row · **`400`** invalid id · **`404`** not found.

### `PATCH /api/registries/:id`
Update a registry. Body: any subset of the writable columns.

**Response `200`** — updated registry row · **`400`/`404`** as above.

### `DELETE /api/registries/:id`
Soft-delete a registry (`is_active = false`).

**Response `200`** — `{ "deleted": "<id>" }`

---

## Action endpoints

### `POST /api/registries/:id/validate`
Runs a lightweight structural validation of the registry and persists the outcome to `aegis.validation_result`.

**Request body (optional)**
```json
{ "validated_by": "string" }
```

**Behavior:** checks `name` (error `missing_name` if absent) and `version` (warning `missing_version` if absent). `is_valid` = `true` iff there are no errors.

**Response `201`** — `validation_result` row:
```json
{
  "id": "uuid",
  "registry_id": "uuid",
  "is_valid": true,
  "errors": [ { "code": "missing_name", "message": "registry has no name" } ],
  "warnings": [ { "code": "missing_version", "message": "registry has no version, defaulting to 1.0.0" } ],
  "suggestions": [],
  "validated_by": "string",
  "validated_at": "ISO-8601"
}
```

### `POST /api/registries/:id/model-check`
Runs the authoritative model check and persists the result to `aegis.model_check_result`. Uses the **real TLC** engine (`tla2tools.jar`) when the registry carries `tla_plus_source`; otherwise falls back to the deterministic **structural state-space checker** over the `aegis` graph. TLC is failure-isolated: a checker crash/timeout yields an `error` status, never a failed HTTP request.

**Request body (optional)**
```json
{ "property_id": "uuid", "checked_by": "string" }
```

**Response `201`** — `model_check_result` row:
```json
{
  "id": "uuid",
  "registry_id": "uuid",
  "property_id": "uuid|null",
  "status": "pass | fail | error | unknown",
  "trace": { "engine": "tlc|structural", ... } | null,
  "checked_properties": ["invariant:<name>=pass: ...", "engine:tlc"],
  "execution_time_ms": 123,
  "checked_by": "string|null",
  "checked_at": "ISO-8601"
}
```

### `GET /api/registries/:id/validation-results`
List validation results for a registry (newest first).

**Response `200`** — `{ "items": [ ...validation_result rows ] }`

### `GET /api/registries/:id/model-check-results`
List model-check results for a registry (newest first).

**Response `200`** — `{ "items": [ ...model_check_result rows ] }`

---

## Child resources (registry-scoped CRUD)

Each resource exposes the same five endpoints under `/api/registries/:id/<resource>`. `:cid` is the child row UUID.

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/registries/:id/<resource>` | list → `{ "items": [...] }` |
| `POST` | `/api/registries/:id/<resource>` | create → `201` row |
| `GET` | `/api/registries/:id/<resource>/:cid` | get → row |
| `PATCH` | `/api/registries/:id/<resource>/:cid` | update → row |
| `DELETE` | `/api/registries/:id/<resource>/:cid` | delete → `{ "deleted": "<cid>" }` |

All writes accept a subset of the resource's create/update columns (below). A write with **zero** recognized fields returns `400 { "error": "no fields provided" }`. Reads/writes validate the parent registry (`404 registry not found`) and the child (`404 <resource> not found`).

### `/api/registries/:id/constants`
`name, type, value (jsonb), description, constraints`

### `/api/registries/:id/variables`
`name, type, initial_value (jsonb), domain (jsonb), description, constraints, attribute_id`

### `/api/registries/:id/states`
`name, description, variable_assignments (jsonb), constraints, is_initial, is_terminal, concept_id, attribute_value_id`

### `/api/registries/:id/transitions`
`name, description, guard_expression, action (jsonb), weak_fairness, strong_fairness, temporal_conditions, priority, from_state_id, to_state_id, guard_rule_id, transition_rule_id, state_transition_id`

### `/api/registries/:id/invariants`
`name, expression, description, is_type_invariant, rule_id, expression_id`

### `/api/registries/:id/properties`
`name, type, expression, description, is_verified, verified_at, verified_by`

### `/api/registries/:id/temporal-properties`
`name, operator, expression, description`

### `/api/registries/:id/concept-mappings`
`tla_name, concept_id, mapping_type, mapping_expression, cardinality`

### `/api/registries/:id/attribute-mappings`
`tla_variable, attribute_id, conversion_function, default_value (jsonb)`

### `/api/registries/:id/relationship-mappings`
`tla_relationship, relationship_id, mapping_type, constraints`

### `/api/registries/:id/execution-log`
`entity_id, from_state_id, to_state_id, transition_id, trigger_event, trigger_user, context (jsonb)`

---

## Example flows

**Create a registry**
```bash
curl -X POST http://localhost:3116/api/registries \
  -H 'Content-Type: application/json' \
  -d '{"name":"MyStateMachine","version":"1.0.0"}'
# 201 -> { "id": "<uuid>", "name": "MyStateMachine", "version": "1.0.0", "is_active": true, ... }
```

**Add a state, then model-check**
```bash
curl -X POST http://localhost:3116/api/registries/<id>/states \
  -H 'Content-Type: application/json' \
  -d '{"name":"s0","is_initial":true}'
curl -X POST http://localhost:3116/api/registries/<id>/model-check \
  -d '{"checked_by":"devops"}'
```

**Soft-delete a registry**
```bash
curl -X DELETE http://localhost:3116/api/registries/<id>
# 200 -> { "deleted": "<id>" }
```

---

## Source of truth
Endpoints are registered literally in [`src/routes.ts`](./src/routes.ts) (contract-first convention — the TypeSpec↔source reconciler proves static coverage). Health is served by [`src/index.ts`](./src/index.ts) at `/health`, outside `/api`. The OpenAPI spec lives in [`openapi.yaml`](./openapi.yaml).