# PEB UI — Uncalled Endpoints & New Functionality

This document describes `peb-srv` API endpoints that are **not yet called** by the
PEB UI client (`src/api/pebClient.ts`) or return **additional data not yet consumed**
by existing views. Each section covers the endpoint path, full response shape,
and a functional description of what the UI could do with it.

> Backend source: `nexus/typescript/peb-srv/src/routes/`
> API docs: `INTEGRATION.md`

---

## 1. `GET /api/peb/transactions/{id}` — Single Transaction

**Not called by pebClient.** Used by: nowhere in the UI yet.

### Response shape

```json
{
  "transaction": {
    "id": "tx_994a_102",
    "idempotency_key": "key_abc",
    "entity_id": "agent:runner-pod-99",
    "admission_result": "ADMITTED",
    "tool_name": "execute_db_migration",
    "input": {},
    "output": {},
    "before_hash": "abc123",
    "after_hash": "def456",
    "state_delta": {},
    "created_at": "2026-07-22T17:10:00.000Z",
    "committed_at": "2026-07-22T17:10:01.000Z",
    "kernel_event_id": null,
    "kernel_event_type": null
  }
}
```
**404:** `{ "status": "error", "message": "transaction not found" }`
**400:** `{ "status": "error", "message": "invalid id" }`

### Functional description

Fetch a single transaction by its ID (the `id` column from `peb.transactions`).
This is the detail view companion to the list endpoint `GET /api/peb/transactions`.

**Where it fits in the UI:**
- Clicking a transaction row in the Events or Causal views could open a detail
  panel showing the full transaction record, including `input`/`output` payloads,
  `state_delta` diff, and hash chain (`before_hash` → `after_hash`).
- The `state_delta` field is the jsonb patch this transaction applied — it's the
  raw input to the state diffing engine.

**New UI component idea:** `TransactionDetailPanel` — a slide-out or modal that
shows input/output JSON, hash chain verification status, and a link to the
lineage view (`/transactions/{id}/lineage`).

---

## 2. `GET /api/peb/entities/{entity_id}/capabilities` — Entity Capability Grants

**Not called by pebClient.** Used by: nowhere in the UI yet.

### Response shape

```json
{
  "entity_id": "agent:runner-pod-99",
  "capabilities": [
    {
      "id": "cap_002",
      "entity_id": "agent:runner-pod-99",
      "capability": "exec_container_script",
      "granted_by": "admin",
      "expires_at": null,
      "active": true,
      "created_at": "2026-07-01T00:00:00.000Z",
      "status": "active"
    },
    {
      "id": "cap_005",
      "entity_id": "agent:runner-pod-99",
      "capability": "exec:raw_sql",
      "granted_by": "admin",
      "expires_at": "2026-07-15T00:00:00.000Z",
      "active": false,
      "created_at": "2026-06-01T00:00:00.000Z",
      "status": "expired"
    }
  ]
}
```
**400:** `{ "status": "error", "message": "invalid entity_id" }`

### Functional description

Lists all capability grants for an entity — both active and expired. Each grant
carries a computed `status` field: `active` (not expired, `active = true`) or
`expired` (past `expires_at` or `active = false`).

**Difference from capability-gap:** The gap endpoint (`/entities/{id}/capability-gap`)
overlays violations against grants to determine whether violations happened
because grants were missing, lapsed, or active. The capabilities endpoint is a
simple list — it answers "what is this agent *supposed* to be able to do."
Together they give a complete picture: granted capabilities vs. attempted violations.

**Where it fits in the UI:**
- The `CapabilityGapView` already shows gap analysis (per-violation). Add a
  companion panel or tab that shows the *granted* capabilities for the entity
  being inspected — the "what they're allowed" side of the equation.
- Could be rendered as a table with columns: Capability, Status (active/expired),
  Granted By, Granted At, Expires At.

**New UI component idea:** `CapabilityGrantsTable` — renders alongside the
existing gap analysis in `CapabilityGapView` for a complete entity capability
profile.

---

## 3. Lineage endpoint — unused fields (`traces`, `traces_tree`, `governance_events`)

**Called by pebClient** (`getLineage()`), but the client only reads `decisions`
and `violations`. It ignores three response fields that the backend returns.

### What gets returned (but not consumed)

The `GET /api/peb/transactions/{id}/lineage` response includes these fields
that `pebClient.getLineage()` does not map:

#### `traces` (flat list)
```json
[
  {
    "id": "trace_001",
    "transaction_id": "tx_994a_102",
    "work_request_id": "wrk_904",
    "parent_trace_id": null,
    "stage": "execute",
    "inputs": {},
    "causal_entries": [],
    "rejected_alternatives": [],
    "confidence": 0.98,
    "status": "completed",
    "created_at": "2026-07-22T17:10:00.000Z"
  }
]
```

#### `traces_tree` (hierarchical, with `children` arrays)
```json
[
  {
    "id": "trace_001",
    "transaction_id": "tx_994a_102",
    "parent_trace_id": null,
    "stage": "execute",
    "confidence": 0.98,
    "rejected_alternatives": [],
    "status": "completed",
    "depth": 0,
    "children": [
      {
        "id": "trace_002",
        "parent_trace_id": "trace_001",
        "stage": "validate",
        "confidence": 0.95,
        "rejected_alternatives": [
          { "stage": "validate_alt", "reason": "slower path" }
        ],
        "children": [],
        ...
      }
    ]
  }
]
```

#### `governance_events` (related events)
```json
[
  {
    "id": 1042,
    "receipt_id": "rcpt_889201",
    "event_type": "violation",
    "work_request_id": "wrk_904",
    "plan_id": "plan_nexus_002",
    "agent_role": "db_migration_agent",
    "payload": {},
    "created_at": "2026-07-22T17:15:30.000Z",
    "replayed_at": null
  }
]
```

### Functional description

The lineage endpoint returns a complete causal picture of a transaction. The
three unused fields are:

- **`traces`** — execution traces tied to the transaction. Each trace has a
  `stage`, `confidence` score (0–1), `rejected_alternatives` (paths considered
  but not taken), and `status`. This is the execution provenance — what actually
  ran.

- **`traces_tree`** — same data but pre-built into a hierarchy via
  `parent_trace_id`. Ready to render as a tree visualization without client-side
  tree building.

- **`governance_events`** — the governance event log entries related to this
  transaction's work requests. Shows the governance admission/decision/violation
  events that fired during execution.

**Where it fits in the UI:**
- `CausalGraphView` currently renders decisions from `getLineage()` but doesn't
  show the trace execution tree or the governance event timeline.
- `traces_tree` is a ready-made tree visualization — could be rendered as a
  collapsible node tree showing each execution stage with its confidence and
  rejected alternatives.
- `governance_events` could be rendered as a timeline below the causal graph,
  showing event-by-event what the governance engine did during execution.

**New UI component ideas:**
- `TraceTreePanel` — renders `traces_tree` as an interactive tree with confidence
  scores and rejected alternative inspection.
- `GovernanceTimeline` — renders `governance_events` as a chronological feed
  within the lineage view.

---

## Summary of uncalled/missing functionality

| Endpoint / Field | Status | Suggested UI Component |
|------------------|--------|----------------------|
| `GET /api/peb/transactions/{id}` | Not called | `TransactionDetailPanel` |
| `GET /api/peb/entities/{id}/capabilities` | Not called | `CapabilityGrantsTable` in `CapabilityGapView` |
| Lineage `.traces` | Returned, ignored | Timeline in `CausalGraphView` |
| Lineage `.traces_tree` | Returned, ignored | `TraceTreePanel` |
| Lineage `.governance_events` | Returned, ignored | `GovernanceTimeline` in `CausalGraphView` |

### Implementation order suggestion

1. **`GET /api/peb/entities/{id}/capabilities`** — simplest endpoint, one method
   in `pebClient.ts`, one table component. Complements existing `CapabilityGapView`.

2. **`GET /api/peb/transactions/{id}`** — simple detail endpoint. Adds drill-down
   from any transaction row.

3. **Lineage `.traces_tree` and `.governance_events`** — enriches `CausalGraphView`
   with execution trace visualization and governance event timeline. More complex
   UI work but high observability value.
