# semantics-srv — REST API Specification

> **Service:** `semantics-srv` — Express REST API over the `semantics.*` Postgres
> schema (the **type-level semantic topology legend** of the Nexus platform).
> **Port:** `3160` (default; `SEMANTICS_SRV_PORT`) · **Base URL:** `http://localhost:3160`
> **Database:** PostgreSQL (`nexus` DB, schema `semantics`, search_path `semantics`)
> **Auth:** none (internal service) · **Docs companion:** `docs/semantics-schema.md`
> (schema/DDL reference) and `semantics-db.md` (design).
>
> `semantics-mcp` (:3161) is a pure MCP facade over this API — it delegates every
> operation to these same REST endpoints and has no direct database access.

---

## 1. Design invariants (read before coding)

- **Append-only, expire-not-delete.** Rows are never physically deleted. Every
  table carries `expired_at`; a row is *active* while `expired_at IS NULL`.
  Soft-delete sets `expired_at = now()`; update **expires the old row and
  inserts a NEW row with a NEW id** (a supersession, not an in-place edit).
- **Natural-key uniqueness applies to active rows only** (partial unique
  indexes `WHERE expired_at IS NULL`), so an expired row no longer blocks
  reuse of its natural key.
- **Writes go through stored procedures** (`add_*`, `update_*`,
  `soft_delete_*`, `resolve_drift_finding`) — the REST layer builds the proc
  call from the table registry. Never write to the tables directly.
- **`p_*` parameter convention.** Write bodies use `p_<column>` keys that map
  1:1 onto stored-proc parameters. `p_id` is accepted everywhere but only
  required for tables where the id is caller-supplied (`owning_subsystem`).
- **Published snapshots are immutable.** Do not mutate rows referenced by a
  published `semantics.snapshot`; create a new snapshot version chained via
  `parent_id` instead.

---

## 2. Envelope shapes (global)

### 2.1 Success envelopes

| Operation | HTTP | Envelope |
|-----------|------|----------|
| List | `200` | `{ "table": "<table>", "count": <n>, "items": [ <row>, … ] }` |
| Get one | `200` | bare row object (`{ "id": … }`) |
| Add | `201` | bare row object (newly inserted) |
| Update | `200` | bare row object of the **new** version, plus `superseded_id` = the expired row's id |
| Soft-delete | `200` | `{ "table": "<table>", "id": "<id>", "deleted": 0\|1 }` (idempotent: 0 if already gone) |
| Resolve drift | `200` | `{ "id": "<id>", "resolved": 0\|1 }` (idempotent: 0 if already resolved/expired/missing) |
| Health | `200` | `{ "status": "ok", "service": "semantics-srv", "port": 3160, "pid": <pid>, "timestamp": "<ISO8601>" }` |
| Meta | `200` | see §3 |

Rows are returned as-is from Postgres: `uuid` ids are strings, timestamps are
ISO-8601 strings, `smallint`/`integer` are numbers, `jsonb` are objects,
`boolean` are booleans.

### 2.2 Error envelope

Every error returns **`{ "error": "<code>", "message": "<detail>" }`** with a
non-2xx status. Codes:

| Code | HTTP | Meaning |
|------|------|---------|
| `not_found` | `404` | Get/update targeted a row that does not exist (or has no active version) |
| `add_failed` | `400` | Insert rejected by the DB (NOT NULL, CHECK, duplicate active key, FK) |
| `duplicate_active_key` | `400` | Duplicate active natural key (SQLSTATE `23505`) on POST/PATCH |
| `update_failed` | `400` | Update proc raised (other than no-active-row) |
| `list_failed` | `500` | List query failed |
| `get_failed` | `500` | Get query failed |
| `soft_delete_failed` | `500` | Soft-delete query failed |
| `resolve_failed` | `500` | Resolve query failed |
| `meta_failed` | `500` | Meta query failed |
| Malformed JSON body | `400` | Express default HTML 400 page — **not** the JSON envelope (body-parser errors are not customized) |

> **Fixed (2026-08-04):** duplicate-key violations previously surfaced as
> `add_failed`/`update_failed` because the handler tested
> `err.message.includes("23505")` while node-postgres exposes the SQLSTATE on
> `err.code`. Handlers now match `err.code === "23505"` and return
> `duplicate_active_key`; covered by the regression test
> `tests/duplicate-active-key.test.ts`.

---

## 3. `GET /api/meta` — schema overview

Introspection endpoint: every table with active/total counts, the stored-proc
count, and the exact writable `p_*` parameter list per table.

```json
{
  "service": "semantics-srv",
  "schema": "semantics",
  "tables": [
    { "table": "owning_subsystem", "label": "owning subsystem (fleet)",
      "idType": "smallint", "idAuto": false, "active": 16, "total": 16 },
    { "table": "concept", "label": "concept (class)",
      "idType": "uuid", "idAuto": true, "active": 11, "total": 11 }
  ],
  "procs": 39,
  "writableParams": {
    "owning_subsystem": ["p_id", "p_name", "p_description", "p_path", "p_expired_at"],
    "concept": ["p_id", "p_name", "p_description", "p_expired_at"]
  }
}
```

`active` counts rows with `expired_at IS NULL`; `total` counts all rows.

---

## 4. Generic per-table CRUD

The same five operations are generated for **all 12 tables** (see §6 for the
table list and per-table parameters). Path segment = table name.

### 4.1 `GET /api/<table>` — list

Query parameters:

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `limit` | int | `100` | clamped to max `500` |
| `offset` | int | `0` | clamped to ≥ 0 |
| `includeExpired` | `true`/`1` | `false` | include rows with `expired_at` set |

Response: `{ "table", "count", "items": [ … ] }` (active rows only unless
`includeExpired`). Rows are ordered by `id`.

```bash
curl "http://localhost:3160/api/concept?limit=5&includeExpired=true"
```

### 4.2 `GET /api/<table>/:id` — get one

- Default: `id` matches the `uuid` primary key (cast to text).
- **`relationship_type` special case:** matches either the uuid PK **or** the
  natural key `name` (e.g. `/api/relationship_type/reads`).

`200` bare row; `404` `{ "error": "not_found", … }` if absent.

### 4.3 `POST /api/<table>` — add

Body: `p_*` parameters (see §6). `p_id` only required where `idAuto=false`.
Returns `201` with the inserted row; `400` on constraint violations.

```bash
curl -X POST http://localhost:3160/api/concept \
  -H 'Content-Type: application/json' \
  -d '{"p_name":"Example","p_description":"A new class"}'
```

### 4.4 `PATCH /api/<table>/:id` — append-only update (supersede)

**Not an in-place edit.** Expires the active row with the given id and inserts
a NEW version (new uuid) from the supplied `p_*` params. The response row
carries `superseded_id` = the id that was expired.

- Table-specific extras:
  - `owning_subsystem`: requires `p_new_id` (the new smallint key).
  - `relationship_type`: requires `p_new_name` (names are never reused).
- `404` if no active row with that id; `400` on constraint violations.

```bash
curl -X PATCH http://localhost:3160/api/concept/<id> \
  -H 'Content-Type: application/json' \
  -d '{"p_name":"Example v2","p_description":"Supersedes the old definition"}'
# → { "id": "<new-uuid>", "name": "Example v2", …, "superseded_id": "<old-uuid>" }
```

### 4.5 `DELETE /api/<table>/:id` — soft-delete (expire)

Sets `expired_at = now()` on the active row. Idempotent: returns `deleted: 1`
on first call, `0` if already expired/missing. `200` always.

> **`relationship_type` nuance:** its soft-delete proc takes `p_name` (not
> `p_id`), so DELETE keys on the type **name** (e.g. `DELETE
> /api/relationship_type/reads`). Deleting by uuid simply won't match
> (`deleted: 0`). Verified against the live server and `V060` proc signature.

---

## 5. `POST /api/drift_finding/:id/resolve` — drift lifecycle

Transitions a `drift_finding` from *detected* → *resolved*.

Body (optional): `{ "p_resolved_at": "<ISO8601>" }` — defaults to `now()` when
omitted/null. Idempotent.

```json
{ "id": "<drift-uuid>", "resolved": 1 }
```

---

## 6. Tables and writable parameters

`idAuto=false` means `p_id` is **required** on add. `smallint`/`jsonb`/`bool`
columns are coerced by the server (numeric/json-parse). `required` columns are
enforced by the DB (NOT NULL). `p_expired_at` is accepted but usually omitted
(rows are expired via DELETE).

| Table | id | idAuto | Writable `p_*` params | Required | Notes |
|-------|----|--------|------------------------|----------|-------|
| `owning_subsystem` | smallint | **false** | `p_id`, `p_name`, `p_description`, `p_path`, `p_expired_at` | `id`, `name` | stable smallint key, caller-supplied; update requires `p_new_id` |
| `concept` | uuid | true | `p_name`, `p_description`, `p_expired_at` | `name` | classes of the legend |
| `representation` | uuid | true | `p_concept_id`, `p_label`, `p_schema_name`, `p_table_name`, `p_owning_subsystem_id`, `p_owner`, `p_raw_metadata` (jsonb), `p_expired_at` | `concept_id`, `label`, `owning_subsystem_id` | physical form of a concept |
| `representation_relationship` | uuid | true | `p_from_representation_id`, `p_to_representation_id`, `p_relationship_type`, `p_notes`, `p_evidence_source`, `p_evidence_type`, `p_confidence`, `p_evidence_notes`, `p_expired_at` | `from_representation_id`, `to_representation_id`, `relationship_type` | CHECK `from <> to` |
| `consumer_operation` | uuid | true | `p_representation_id`, `p_consumer_name`, `p_operation`, `p_notes`, `p_expired_at` | `representation_id`, `consumer_name`, `operation` | who touches a representation |
| `identity_strategy` | uuid | true | `p_concept_id`, `p_canonical_key_description`, `p_notes`, `p_expired_at` | `concept_id`, `canonical_key_description` | one active strategy per concept |
| `representation_identity` | uuid | true | `p_representation_id`, `p_identity_strategy_id`, `p_identity_expression`, `p_notes`, `p_expired_at` | `representation_id`, `identity_strategy_id`, `identity_expression` | one active row per representation |
| `snapshot` | uuid | true | `p_label`, `p_version`, `p_parent_id`, `p_status`, `p_created_by`, `p_notes`, `p_expired_at` | `label`, `version`, `created_by` | per-baseline judgment record; chain via `parent_id` |
| `snapshot_observation` | uuid | true | `p_snapshot_id`, `p_representation_id`, `p_lifecycle_state`, `p_is_completed_fix` (bool), `p_completed_fix_ref`, `p_audit_reason`, `p_safe_to_retire` (bool), `p_expired_at` | `snapshot_id`, `representation_id`, `lifecycle_state` | unique active `(snapshot_id, representation_id)` |
| `drift_finding` | uuid | true | `p_observation_id`, `p_description`, `p_severity`, `p_resolved_at`, `p_expired_at` | `observation_id`, `description`, `severity` | lifecycle via `POST …/drift_finding/:id/resolve` |
| `concept_relationship` | uuid | true | `p_from_concept_id`, `p_to_concept_id`, `p_relationship_type`, `p_path`, `p_notes`, `p_evidence_source`, `p_evidence_type`, `p_confidence`, `p_evidence_notes`, `p_expired_at` | `from_concept_id`, `to_concept_id`, `relationship_type` | `path` = `green`/`red`/null |
| `relationship_type` | uuid | true | `p_name`, `p_description`, `p_scope`, `p_notes`, `p_expired_at` | `name`, `description` | vocabulary; lookup by name **or** uuid; update requires `p_new_name` |

**Evidence columns** (`evidence_source`, `evidence_type`, `confidence`,
`evidence_notes`) exist on `representation_relationship` and
`concept_relationship` (V064) and record the provenance backing each edge —
`confidence` is a number in `[0,1]`.

---

## 7. Relationship-type vocabulary

`semantics.relationship_type` is the FK-referenced vocabulary of legal edge
types. As of 2026-08-04 the 31 active types are:

`basis_of` · `calls` · `constrains` · `consumes` · `defines` ·
`depends_on_decision` · `derived` · `derives_from` · `emits` · `equivalent` ·
`evidences` · `governs` · `implements` · `interprets` · `legacy` · `mediates` ·
`member_of` · `observes` · `owns` · `partial` · `produces` · `projects` ·
`provenance_of` · `questions` · `reads` · `spawns` · `supersedes` ·
`transforms_into` · `uses` · `validates` · `writes`

`scope` is an advisory tag (`concept` / `representation` / `both`); the
vocabulary itself is the constraint, not the scope. Query the live set via
`GET /api/relationship_type`.

---

## 8. Client reference (`semantics-mcp`)

The MCP server mirrors this API 1:1 as tools:

- `semantics_meta` → `GET /api/meta`
- `semantics_list_<table>` → `GET /api/<table>?limit=&includeExpired=`
- `semantics_get_<table>` → `GET /api/<table>/:id`
- `semantics_add_<table>` → `POST /api/<table>` (same `p_*` body)
- `semantics_update_<table>` → `PATCH /api/<table>/:id`
- `semantics_soft_delete_<table>` → `DELETE /api/<table>/:id`
- `semantics_resolve_drift_finding` → `POST /api/drift_finding/:id/resolve`

---

## 9. Error handling & operational notes

- **Connection:** the service connects to the `nexus` DB via
  `SEMANTICS_PG_DSN`/`NEXUS_PG_DSN` (default
  `postgresql://pguser:pgpass@localhost:5432/nexus`) with
  `search_path=semantics`. It fails fast on startup if the DB is unreachable.
- **Heartbeat:** registers with the service registry (service id 60, :8085)
  every 30s via `heartbeat-client`.
- **Process safety:** `EADDRINUSE` exits with code 1; connection noise
  (`EPIPE`/`ECONNRESET`/`ETIMEDOUT`) is logged and swallowed.
- **JSONB params** (`p_raw_metadata`) accept either a JSON object or a
  JSON-string (parsed server-side).
