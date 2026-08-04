# peb-srv

Observability REST API for the **PEB (Persistent Engineering Brain)** governance
schema — a thin layer over the `peb` tables in the `nexus` PostgreSQL
database.

The PEB schema (`peb.capabilities`, `peb.decisions`, `peb.governance_events`,
`peb.role_circuit_breaker`, `peb.state`, `peb.traces`, `peb.transactions`,
`peb.violations`) records *governance events*: admission of agent
transactions, decisions applied to state, capability grants made and revoked,
violations raised, and circuit-breaker trips. The schema has no foreign-key
constraints by design (joins are logical), so the REST API is the place where
the right joins get encoded once and reused.

This service implements the five endpoint groups described in
[`REST API.md`](./REST%20API.md):

1. **Event stream** — cursor-paginated log-tail over `governance_events`, plus
   a replay action that marks an event as replayed.
2. **Causal graph** — `transactions/{id}/lineage`, `decisions/{id}/chain`,
   `traces/{id}/tree`, `entities/{id}/capability-gap`.
3. **Rollup / fleet health** — circuit-breaker status, violations summary
   grouped by `severity | violation_type | entity_id`, decisions
   `entropy_class` rollup with trend.
4. **State diffing** — `state/{key}/versions` and `state/{key}/diff` — derived
   from `transactions.state_delta` (the `state` table holds current values
   only; history is replayed from the transaction ledger).
5. **Live stream** — `GET /api/peb/events/stream` (Server-Sent Events).

## Quick start

```bash
cd ~/dev/nexus/typescript/peb-srv
npm install
PEB_SRV_PORT=3111 npm run dev
```

Default DSN: `postgresql://pguser:pgpass@localhost:5432/nexus` — override via
`PEB_PG_DSN`. Default port is `3111` (`PEB_SRV_PORT`).

Then:

```bash
npm run typecheck          # tsc strict, noEmit
npm test                   # node:test unit suite
npm run smoke              # end-to-end against a running server
```

The smoke script exercises every endpoint, including the SSE stream and the
404 / replay-idempotency / cursor-pagination edge cases.

## Endpoints

All under `/api/peb` (except root `/health`).

| Method | Path | Notes |
|--------|------|-------|
| `GET`    | `/health` | Service-level health + counts |
| `GET`    | `/api/peb/events?since=&event_type=&plan_id=&agent_role=&work_request_id=&limit=&offset=` | Cursor-paginated log tail (`since` is exclusive on `governance_events.id`) |
| `GET`    | `/api/peb/events/{receipt_id}` | Fetch one by its text receipt id |
| `POST`   | `/api/peb/events/{receipt_id}/replay` | Stamp `replayed_at = now()`, push a `replay` event on the SSE bus |
| `GET`    | `/api/peb/transactions?entity_id=&tool_name=&admission_result=&since=&limit=&offset=` | List transactions (newest first) |
| `GET`    | `/api/peb/transactions/{id}` | One transaction |
| `GET`    | `/api/peb/transactions/{id}/lineage` | Causal graph in one payload |
| `GET`    | `/api/peb/decisions/{id}/chain?direction=ancestry\|rollback` | Walks `parent_decision_id` or `rollback_of` |
| `GET`    | `/api/peb/traces/{id}/tree` | Recursive descendants of a trace, with `rejected_alternatives` and `confidence` at each node |
| `GET`    | `/api/peb/entities/{entity_id}/capability-gap` | As-of overlay of `capabilities` grants against `violations.capability_attempted` |
| `GET`    | `/api/peb/entities/{entity_id}/capabilities` | Convenience: list grants for an entity |
| `GET`    | `/api/peb/health/circuit-breakers` | All roles, tripped-first |
| `GET`    | `/api/peb/health/violations/summary?window=24h&group_by=severity\|violation_type\|entity_id` | Rolling window rollup |
| `GET`    | `/api/peb/health/entropy?group_by=entropy_class\|author_id\|status&window=` | Counts + per-day trend |
| `GET`    | `/api/peb/state/{key}/versions` | All transactions that touched `key`, plus the current state row |
| `GET`    | `/api/peb/state/{key}/diff?from=<tx_id>&to=<tx_id\|current>` | Replay `state_delta` patches for `key` and diff |
| `GET`    | `/api/peb/events/stream?plan_id=&agent_role=` | SSE live stream + poll loop |

## Capability-gap overlay semantics

A `violations` row with `capability_attempted = X` and `entity_id = E` is
overlaid against `capabilities` rows where `capabilities.entity_id = E AND
capabilities.capability = X AND capabilities.created_at <= violations.created_at
AND (capabilities.expires_at IS NULL OR capabilities.expires_at >
violations.created_at) AND capabilities.active = true`.

Each row in the response carries a `gap_status` field:

- `active` — one or more in-window grants existed at the moment the attempt was
  made (the violation is therefore a deliberate overstep, not a stale grant).
- `lapsed` — a capability grant with the same name existed for this entity once
  but had expired (or been deactivated) before this attempt.
- `missing` — no capability grant ever existed for this entity + capability.

## State history & diff

`peb.state` is a **current-value** table (`version` + `checksum` only). The
historical record lives inside `transactions.state_delta` — each transaction
whose `state_delta` mentions `key` (top-level key, or carried inside a
`keys` jsonb array) is a potential version. `/state/{key}/versions` lists
those touchers in chronological order.

`/state/{key}/diff` reconstructs the value at two user-supplied transaction ids
by replaying each `state_delta[key]` snapshot in order (shallow-merge), then
returns the added / removed / changed diff. The special `to=current` uses the
live `peb.state` row as the to side.

## Live stream

`GET /api/peb/events/stream` is an SSE endpoint. On connect the server sends a
`ready` event; thereafter it polls `governance_events` once per second for new
rows past the latest `id` at connect time, plus it forwards any in-process
event-bus pushes (e.g. the `replay` event emitted by
`POST /events/{receipt_id}/replay`). Optional filters narrow the stream to the
requested `plan_id` and/or `agent_role`.

A 15s keepalive comment is written to keep intermediate proxies from closing
the connection.

## Schema assumptions & invariants

- The `peb` schema has **no foreign-key constraints** — this is by design.
  Join identity lives in the REST layer.
- `governance_events.id` is a bigserial and serves as the streaming cursor.
- `governance_events.receipt_id` is a free-form text and is the externally
  referenced event id.
- `transactions.state_delta` is `jsonb` and treated as a patch on some
  parent state. There is no enforced correlation between a transaction and the
  state key(s) it touched; this REST API uses **top-level jsonb key match**
  against the requested `key` plus an optional `{ "keys": [...] }` pattern.
- Replay (`POST /events/{receipt_id}/replay`) is **informational**: it stamps
  `replayed_at = now()` and publishes an event on the SSE bus. It **does not**
  re-execute any downstream side effect — that is the architect's call to make
  explicit (see the R1 record for `peb-srv`).

## Migration / DDL

None — `peb` exists already. Nothing in this service writes DDL; only
`UPDATE peb.governance_events SET replayed_at` is mutated by this service and
that is a single column on an existing column.


---

## REST API & OpenAPI

- Endpoint inventory: [`API.md`](./API.md) (generated from source route registrations)
- OpenAPI 3.0 spec: [`openapi.yaml`](./openapi.yaml) (generated from source route registrations)

Regenerate after route changes:

```bash
cd nexus
python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json
```
