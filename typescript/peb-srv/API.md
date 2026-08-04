# peb-srv — Push Event Bus API

> Port: **3111**  
> REST reference: `API.md` · OpenAPI spec: [`openapi.yaml`](./openapi.yaml)

Push Event Bus: decisions, transactions, fleet health, events, entities, state, traces, and the SSE event stream.

**23 endpoints** — inventory generated from source route registrations (`nexus/tools/api-docs/`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/peb/decisions` | List decisions GET /api/peb/decisions?status=&author_id=&adr_number=&affected_key=&limit=&offset= |
| POST | `/api/peb/decisions` | Create decision (ADR) POST /api/peb/decisions Body: { title, author_id, summary?, affected_keys?, entropy_class?, parent_decision_id?, rollback_of?, adr_number?, status?, transaction_id? } |
| GET | `/api/peb/decisions/:id` | Get decision by ID GET /api/peb/decisions/:id |
| PATCH | `/api/peb/decisions/:id` | Update decision PATCH /api/peb/decisions/:id Body: { title?, summary?, status?, affected_keys?, entropy_class?, parent_decision_id? } |
| GET | `/api/peb/decisions/:id/chain` | Chain traversal GET /api/peb/decisions/:id/chain?direction=ancestry\|rollback |
| POST | `/api/peb/decisions/:id/supersede` | Supersede a decision POST /api/peb/decisions/:id/supersede Body: { summary, author_id, affected_keys? } Creates a new decision that supersedes this one. |
| GET | `/api/peb/decisions/next-number` | Get next ADR number GET /api/peb/decisions/next-number |
| GET | `/api/peb/entities/:entity_id/capabilities` | Convenience: capabilities for an entity (list, with a status rollup) Not in the spec but useful for the UI to ground the gap view. |
| GET | `/api/peb/entities/:entity_id/capability-gap` | AND (c.expires_at IS NULL OR c.expires_at > v.created_at) gap_status: "active" : a live grant was in-window when the attempt fired "lapsed" : a grant had existed for this capability but had expired or been deactivated before the attempt "missing": no capability grant ever existed for this id + capab |
| GET | `/api/peb/events` | GET /api/peb/events?since=<cursor>&event_type=&plan_id=&agent_role=&limit=&offset= |
| GET | `/api/peb/events/:receipt_id` | GET /api/peb/events/{receipt_id} |
| POST | `/api/peb/events/:receipt_id/replay` | POST /api/peb/events/{receipt_id}/replay Spec: sets replayed_at, re-runs downstream effects. Implemented as: stamp replayed_at = now() (idempotent if already set), then publish a 'replay' event on /events/stream for any subscribers. |
| GET | `/api/peb/events/stream` | stream to plan_id / agent_role. Implementation note: we use a poll loop (1s) against the DB to surface new governance_events rows. A more elegant path is PG LISTEN/NOTIFY against a trigger on peb.governance_events after INSERT; we keep that as a TODO on the README and lean on the simpler poller for  |
| GET | `/api/peb/health/circuit-breakers` | GET /api/peb/health/circuit-breakers Spec: role_circuit_breaker, tripped-first sort |
| GET | `/api/peb/health/entropy` | GET /api/peb/health/entropy?group_by=entropy_class Spec: decisions.entropy_class over time — churn/stability signal. |
| GET | `/api/peb/health/violations/summary` | GET /api/peb/health/violations/summary?window=24h&group_by=severity\|violation_type\|entity_id |
| GET | `/api/peb/state/:key/diff` | (state_delta[K] overwrites prior value if present, removed markers null out a key from prior content). - Compare the two reconstructed snapshots for K. Return the diff: { from: <content>, to: <content>, added, removed, changed } - If `to` is the special value 'current', use the live peb.state row as |
| GET | `/api/peb/state/:key/versions` | dashboards that just want the version timeline. State diff: walk transactions that touched K in order, replay state_delta patches in order to derive the content at version N, and surface the diff between two user-supplied version ids. GET /api/peb/state/{key}/versions |
| GET | `/api/peb/traces/:id/tree` | A trace lives in `peb.traces` and may have a `parent_trace_id` pointing at another trace (could be in a different transaction). We return the full subtree rooted at `id` (including all descendants across transactions), followed by the chain of ancestors from `id` up to the root (so callers can rende |
| GET | `/api/peb/transactions` | GET /api/peb/transactions?entity_id=&tool_name=&admission_result=&since=&limit=&offset= |
| GET | `/api/peb/transactions/:id` | GET /api/peb/transactions/{id} |
| GET | `/api/peb/transactions/:id/lineage` | traces tree rooted at this transaction (via parent_trace_id), each node carrying confidence and rejected_alternatives any violations raised, joined against the capabilities the entity_id actually held at created_at (as-of join) governance_events with matching work_request_id/plan_id, ordered by crea |
| GET | `/health` |  |

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json   # (vision-srv also refreshes from the live FastAPI spec)
```
