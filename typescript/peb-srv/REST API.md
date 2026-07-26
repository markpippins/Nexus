schema: nexus/peb Observability API

> **Implementation status:** All endpoints below are implemented in
> `src/routes/`. See [README.md](./README.md) for endpoint details and
> [INTEGRATION.md](../../angular/peb-ui/INTEGRATION.md) for response shapes.

1. Event stream (low-level, append-only)

```
GET  /api/peb/events?since=<cursor>&event_type=&plan_id=&agent_role=&work_request_id=&limit=&offset=
GET  /api/peb/events/{receipt_id}
POST /api/peb/events/{receipt_id}/replay        # stamps replayed_at = now() (idempotent),
                                                 # pushes replay event on SSE bus
GET  /api/peb/transactions?entity_id=&tool_name=&admission_result=&since=&limit=&offset=
GET  /api/peb/transactions/{id}
```

This is the thin layer over `governance_events` and `transactions` — cursor-paginated, filterable, good for a log-tail UI or feeding a message bus. `since` is exclusive on `governance_events.id` (bigserial). `limit` defaults to 20 (max 500). Nothing clever here; it's the substrate everything else is built on.

Replay (`POST /events/{receipt_id}/replay`) is **informational**: it stamps `replayed_at = now()` and publishes an event on the SSE bus. It does **not** re-execute any downstream side effect — that is the architect's call to make explicit (see the R1 record for `peb-srv`).

2. Causal graph (the actual observability value)

```
GET /api/peb/transactions/{id}/lineage
```

This is the endpoint that matters most. Given a transaction id, walk and return in one payload:

- the decisions row(s) tied to it, plus their `parent_decision_id` ancestry and `rollback_of` chain
- the traces tree rooted at that transaction (via `parent_trace_id`), each node carrying `confidence` and `rejected_alternatives`
- any violations raised, joined against the capabilities the `entity_id` actually held at `created_at` (not now — capabilities expire, so this has to be an as-of join)
- the `governance_events` with matching `work_request_id` (via traces), ordered by `created_at`, with `replayed_at` surfaced so the UI can show "this was replayed on X"

```
GET /api/peb/decisions/{id}/chain?direction=ancestry|rollback
GET /api/peb/traces/{id}/tree                     # recursive descendants with rejected_alternatives
GET /api/peb/entities/{entity_id}/capability-gap  # attempted vs granted, over time
GET /api/peb/entities/{entity_id}/capabilities    # convenience: list grants for an entity
```

The capability-gap endpoint is worth calling out specifically: it's not "list violations," it's "for this entity, overlay every capabilities grant/expiry against every `violations.capability_attempted`" — that's the view that actually answers "was this agent trying to do something it was never supposed to, or did its grant just lapse at a bad time," which are very different governance stories. Returns `gap_status` of `active`, `lapsed`, or `missing` per violation.

3. Rollup / fleet health

```
GET /api/peb/health/circuit-breakers              # role_circuit_breaker, tripped-first sort
GET /api/peb/health/violations/summary?window=24h&group_by=severity|violation_type|entity_id
GET /api/peb/health/entropy?group_by=entropy_class|author_id|status&window=
```

`decisions.entropy_class` is tracked as a churn/stability signal — a time-series of entropy by class is a good "is the system getting more or less chaotic" dashboard, separate from raw violation counts. The endpoint also returns a per-day trend suitable for chart rendering.

4. State diffing

```
GET /api/peb/state/{key}/versions
GET /api/peb/state/{key}/diff?from=<tx_id>&to=<tx_id|current>
```

`peb.state` has `version` + `checksum` but is a **current-value table only** — no history table. Historical versions are reconstructed from `transactions.state_delta` by walking transactions that touched `key` in chronological order, replaying `state_delta` patches (shallow-merge semantics). The diff endpoint replays to both `from` and `to` transaction positions, then diffs the two reconstructed snapshots — returning `added`, `removed`, and `changed` fields. The special `to=current` compares against the live `peb.state` row instead of a historical transaction position.

5. Live stream

```
SSE  /api/peb/events/stream?plan_id=&agent_role=
```

For the topology viewer or a live governance dashboard — polls `governance_events` every 1s for new rows beyond the latest `id` at connect time, plus forwards in-process SSE bus events (e.g. replays). 15s keepalive comments prevent proxy timeouts. Optional filters narrow the stream to the requested `plan_id` and/or `agent_role`.
