# DRIFT.md — semantic-kernel-ui Client vs kernel-srv API Mismatches

**Date:** 2026-07-23
**Compared:** `src/services/kernelApiClient.ts` + `src/types/kernel.ts` ↔ `nexus/typescript/kernel-srv/src/routes.ts` + `index.ts`
**Status:** 11 critical, 1 medium, 6 correct endpoints

---

## Critical (data silently wrong or call fails)

### C1 — `postTransition()`: missing required `actor` field

**Real API** (`POST /api/kernel/transitions`):
```typescript
// Required: event_type, aggregate_type, aggregate_id, actor
// Optional: payload, authority, receipt, causation_id, correlation_id
```

**Client type** (`types/kernel.ts`):
```typescript
export interface TransitionRequest {
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, any>;
  idempotency_key?: string;
  causality_parent_id?: string;
  plan_number?: string;
  // ← MISSING: actor (required!)
}
```

**Impact:** Every real API call fails with `400: "Missing required field: actor"`. The `actor` field is validated at line 41 of `routes.ts`. The mock engine works fine (it doesn't validate), but live mode is completely broken for this endpoint.

**Remediation:** Add `actor: string` to `TransitionRequest`. Update `TransitionsView.tsx` to include an actor input. Remove `idempotency_key` and `causality_parent_id` from the request type — they don't map to any real API fields (the API uses `causation_id` and `correlation_id`).

---

### C2 — `issueReceipt()`: completely wrong request fields

**Real API** (`POST /api/kernel/receipts`):
```typescript
// Required: receipt_type, receipt_hash, event_id, issued_by
// Optional: plan_number, metadata (jsonb)
```

**Client type** (`types/kernel.ts`):
```typescript
export interface IssueReceiptRequest {
  event_id: string;           // ✅ exists in API
  plan_number?: string;       // ✅ exists in API (optional)
  issuer_identity?: string;   // ← API field is "issued_by", not "issuer_identity"
  // ← MISSING: receipt_type (required!)
  // ← MISSING: receipt_hash (required!)
}
```

**Impact:** Every real API call fails with `400: "Missing required field: receipt_type"`. The mock engine works, but live mode is completely broken. The `issuer_identity` field name is also wrong (API expects `issued_by`).

**Remediation:** Rewrite `IssueReceiptRequest`:
```typescript
export interface IssueReceiptRequest {
  receipt_type: string;       // required
  receipt_hash: string;       // required
  event_id: string;           // required
  issued_by: string;          // required (was issuer_identity)
  plan_number?: string;       // optional
  metadata?: Record<string, any>;  // optional
}
```
Update `ReceiptsView.tsx` to include inputs for `receipt_type`, `receipt_hash`, and `issued_by`.

---

### C3-C7 — Five GET endpoints return wrapped objects but client expects unwrapped arrays

The real API wraps responses in objects. The client's `await res.json()` returns the wrapper, but the TypeScript type annotation says the method returns the inner array. TypeScript won't catch this at runtime.

| Method | API returns | Client type expects | Impact |
|--------|-----------|-------------------|--------|
| **C3** `getCausalityChain()` | `{ root_event_id, chain: [...], depth }` | `CausalityNode[]` | Receives an object, maps as array — all array methods fail |
| **C4** `getReceiptChain()` | `{ receipt_id, event_id, chain: [...] }` | `ReceiptChainNode[]` | Same — object where array expected |
| **C5** `getAggregateEvents()` | `{ aggregate_type, aggregate_id, aggregates: {...} }` | `AggregateEvent[]` | Object (single aggregate) where array expected |
| **C6** `getActivePolicy()` | `{ active_rules: [...], count }` | `PolicyRule[]` | Object where array expected |
| **C7** `getRecentEvents()` | `{ recent: [...], count }` | `RecentEvent[]` | Object where array expected |

**Impact:** All five methods silently return objects when the calling component expects arrays. This causes blank tables or React key errors in `CausalityView`, `ReceiptsView`, `AggregateExplorerView`, `PolicyEngineView`, and `OverviewDashboard`.

**Remediation:** For each method, unwrap the response before returning:
```typescript
// C3: getCausalityChain
return data.chain || [];

// C4: getReceiptChain
return data.chain || [];

// C5: getAggregateEvents — note: API returns exactly ONE aggregate object
//      (rows[0]), not a list. Wrap in array for UI list consistency.
return data.aggregates ? [data.aggregates] : [];

// C6: getActivePolicy
return data.active_rules || [];

// C7: getRecentEvents
return data.recent || [];
```

**Note for C5:** `AggregateExplorerView` should be aware that this endpoint returns a single-element list — each aggregate_type/aggregate_id pair resolves to exactly one aggregate object. The UI should not expect pagination or multiple aggregates from a single call.

---

### C8 — `getReceiptIntegrity()`: complete response shape mismatch

**Real API** (`GET /api/kernel/health/receipt-integrity`):
```json
{ "orphan_count": 5, "orphans": [{ "receipt_id": "...", "receipt_type": "...", ... }] }
```

**Client type** (`types/kernel.ts`):
```typescript
export interface ReceiptIntegrity {
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';  // ← doesn't exist
  total_receipts: number;                         // ← doesn't exist
  orphaned_count: number;                         // ← API calls it "orphan_count"
  orphaned_ids: string[];                         // ← API returns full receipt objects, not just IDs
  integrity_pct: number;                          // ← doesn't exist
  last_audit_at: string;                          // ← doesn't exist
  orphan_check_details: Array<{...}>;             // ← API returns "orphans" directly
}
```

**Impact:** 5 of 7 fields are fabricated. The real `orphan_count` maps to `orphaned_count` via fallback (if the client had one), but `status`, `total_receipts`, `integrity_pct`, and `last_audit_at` are always fake data.

**Remediation:** Rewrite `ReceiptIntegrity` to match the real API:
```typescript
export interface ReceiptIntegrity {
  orphan_count: number;
  orphans: Array<{
    receipt_id: string;
    receipt_type: string;
    receipt_hash: string;
    event_id: string;
    issued_by: string;
    created_at: string;
  }>;
}
```
Derive `status` client-side: `orphan_count === 0 ? 'HEALTHY' : 'DEGRADED'`.

---

### C9 — `getPolicyMaturity()`: complete field mismatch

**Real API** (`GET /api/kernel/policy/maturity`) returns from `kernel.v_policy_maturity`:
```json
{ "total_rules": 10, "enabled_rules": 8, "compiled_enabled": 5, "data_driven_enabled": 3, "disabled_rules": 2, "data_driven_pct": "37.50", "compiled_pct": "62.50" }
```

**Client type** (`types/kernel.ts`):
```typescript
export interface PolicyMaturity {
  compiled_count: number;       // ← API calls it "compiled_enabled"
  data_driven_count: number;    // ← API calls it "data_driven_enabled"
  ratio: number;                // ← doesn't exist as named field
  maturity_grade: '...';        // ← doesn't exist
  total_rules: number;          // ✅ exists
  breakdown: Array<{...}>;      // ← doesn't exist
}
```

**Impact:** `compiled_count` and `data_driven_count` are always `undefined`. The `breakdown` array is always empty. `ratio` and `maturity_grade` are fabricated.

**Remediation:** Rewrite `PolicyMaturity` to match the real view:
```typescript
export interface PolicyMaturity {
  total_rules: number;
  enabled_rules: number;
  compiled_enabled: number;
  data_driven_enabled: number;
  disabled_rules: number;
  data_driven_pct: string;
  compiled_pct: string;
}
```
Derive `ratio` and `maturity_grade` client-side if needed.

---

### C10 — `getHealth()`: fabricated fields + wrong URL path

**Real API** (`GET /health` or `GET /api/health` — NOT under `/api/kernel`):
```json
{ "status": "healthy", "db": true, "pgNotify": true, "subscribers": 5 }
```

**Client type** (`types/kernel.ts`):
```typescript
export interface KernelHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  db: boolean;                    // ✅ exists
  pgNotify: boolean;              // ✅ exists
  subscribers: number;            // ✅ exists
  uptime_seconds: number;         // ← doesn't exist
  recent_events_count: number;    // ← doesn't exist
  avg_lag_ms: number;             // ← doesn't exist
  kernel_version: string;         // ← doesn't exist
}
```

**Impact:** 4 of 8 fields are fabricated — always `undefined`/`0`/`''`. 

**Remediation:** Remove `uptime_seconds`, `recent_events_count`, `avg_lag_ms`, `kernel_version` from `KernelHealth`. Call `getRecentEvents()` and `getHealth()` separately if those metrics are needed.

---

### C11 — Health endpoint unreachable with default proxy path

**Client** (`kernelApiClient.ts:29`):
```typescript
private config: KernelApiConfig = {
  useMock: true,
  targetHost: '/api/kernel',       // ← default
};
```

**`getHealth()` call** (line 262):
```typescript
const res = await fetch(`${this.getBaseUrl()}/health`);
// When targetHost is '/api/kernel', this fetches '/api/kernel/health'
```

**Real API** (`index.ts`): Health is mounted at `/health` and `/api/health`, NOT under `/api/kernel`.

**Impact:** When using the default proxy config, every health check hits `/api/kernel/health` which returns 404. The client falls back to mock data with `status: 'degraded'`, which is a misleading signal — the service isn't degraded, the URL is wrong.

**Remediation:** Options:
- (a) Add `/api/kernel/health` route to kernel-srv
- (b) Change `getHealth()` to use a separate base URL (e.g., `/api` instead of `/api/kernel`)
- (c) Document that `targetHost` must be `http://localhost:8100` (full URL, not proxy path) for health to work

Option (a) is simplest — add `router.get('/health', ...)` in routes.ts to mirror the health check.

---

## Medium (fallback logic works but suboptimal)

### M1 — `getPlanReceipts()`: `summary` is a raw view row, not structured data

**Real API** (`GET /api/kernel/plans/{plan_number}/receipts`):
```json
{ "plan_number": "...", "summary": { /* first row of v_plan_receipts */ }, "chains": [...] }
```

**Client type** expects `PlanReceipts` with fields `plan_name`, `total_events`, `receipts_issued`, `completion_pct`, `status`, `last_updated`, `receipts[]`.

**Impact:** `summary` is a raw view row — its fields depend on `v_plan_receipts` column names, not the `PlanReceipts` interface. The `chains` field contains `v_receipt_chain` rows (fields: `receipt_created_at`, `receipt_type`, `receipt_hash`, etc.), not `Receipt` objects (fields: `id`, `signature`, `status`, `issuer`). This is a complete object shape mismatch for every chain entry, not just a field rename.

**Remediation:** Rewrite `PlanReceipts` to match:
```typescript
export interface PlanReceipts {
  plan_number: string;
  summary: Record<string, any>;  // raw v_plan_receipts row
  chains: ReceiptChainNode[];    // from v_receipt_chain — note: NOT Receipt objects
}
```
The `ReceiptChainNode` type already has the correct fields (`receipt_id`, `event_id`, `event_type`, `aggregate_id`, `issued_at`, `hash`, `previous_hash`, `sequence_index`). Build dashboard metrics from `summary` or derive client-side.

---

## Correct Endpoints (no changes needed)

| Method | Verdict |
|--------|---------|
| `getTransition()` | ✅ Correct path, raw DB row returned — `TransitionEvent` type may need some field tweaks but no structural mismatch |
| `subscribeEventStream()` | ✅ Correct: `EventSource` on `/events/stream`, listens for `kernel_event` type |
| `postTransition()` path | ✅ Correct URL `/transitions` — issue is only the missing `actor` field (C1) |
| `issueReceipt()` path | ✅ Correct URL `/receipts` — issue is only the wrong fields (C2) |
| `getPlanReceipts()` path | ✅ Correct URL `/plans/{plan_number}/receipts` |
| `getAggregateEvents()` path | ✅ Correct URL `/aggregates/{type}/{id}/events` |

---

## Type Drift (`src/types/kernel.ts`)

| Type | Field | Issue |
|------|-------|-------|
| `TransitionRequest` | (missing) | Lacks required `actor: string` |
| `TransitionRequest` | `idempotency_key` | Not a real API field |
| `TransitionRequest` | `causality_parent_id` | API uses `causation_id` |
| `IssueReceiptRequest` | (missing) | Lacks required `receipt_type`, `receipt_hash` |
| `IssueReceiptRequest` | `issuer_identity` | API field is `issued_by` |
| `Receipt` | `signature` | Not in API response |
| `Receipt` | `status: 'VALID' \| 'REVOKED' \| 'ORPHANED'` | Not in API response |
| `Receipt` | `issuer` | API returns `issued_by` |
| `PlanReceipts` | `plan_name` through `receipts` | All fabricated — API returns `{plan_number, summary, chains}` |
| `AggregateEvent` | `sequence_number` | Not in real `v_aggregate_events` view |
| `PolicyRule` | `type: 'COMPILED' \| 'DATA_DRIVEN'` | Not confirmed in real `v_active_policy` view |
| `PolicyRule` | `eval_count`, `avg_eval_ms` | Not confirmed in real view |
| `PolicyMaturity` | All fields except `total_rules` | Complete mismatch with `v_policy_maturity` view |
| `RecentEvent` | `propagation_lag_ms` | May not be in `v_recent_events` view |
| `ReceiptIntegrity` | All 7 fields | Complete mismatch with API's `{orphan_count, orphans}` |
| `KernelHealth` | `uptime_seconds`, `recent_events_count`, `avg_lag_ms`, `kernel_version` | None exist in real API |

---

## Remediation Order (priority)

1. **C1** — Add `actor` to `TransitionRequest` (unblocks transitions live mode)
2. **C2** — Rewrite `IssueReceiptRequest` with correct fields (unblocks receipts live mode)
3. **C3-C7** — Unwrap wrapped responses in all 5 GET methods (fixes blank tables)
4. **C8** — Rewrite `ReceiptIntegrity` type to match `{orphan_count, orphans}`
5. **C9** — Rewrite `PolicyMaturity` type to match `v_policy_maturity` view
6. **C10** — Remove fabricated fields from `KernelHealth`
7. **C11** — Fix health endpoint URL (add route or use full URL)
8. **M1** — Rewrite `PlanReceipts` to match `{plan_number, summary, chains}`

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/kernel.ts` | Rewrite 8 interfaces to match real API shapes |
| `src/services/kernelApiClient.ts` | Add `actor` to transition call, fix receipt call fields, unwrap C3-C7 responses, fix C10 |
| `src/components/TransitionsView.tsx` | Add `actor` input field |
| `src/components/ReceiptsView.tsx` | Add `receipt_type`, `receipt_hash`, `issued_by` inputs |
| `src/components/*.tsx` (all views consuming wrapped responses) | May need adjustments after unwrapping |
