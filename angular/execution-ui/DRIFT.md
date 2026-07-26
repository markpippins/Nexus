# DRIFT.md — execution-ui ↔ execution-srv

> **Purpose:** Document all known shape differences between the execution-ui
> React client (types + apiClient) and the execution-srv Express backend.
>
> The client defaults to **mock mode** (`apiClient.ts:useMock = true`) for
> instant preview. When switched to live mode, these drifts prevent the
> UI from rendering backend data correctly.
>
> Last updated: 2026-07-24

---

## 1. Global Shape Convention

| Axis | Client (Mock) | Backend (execution-srv) |
|---|---|---|
| IDs | Hex-prefixed strings (`req_000001`, `les_000001`, `att_000001`, `rcp_000001`) | PostgreSQL UUIDs (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) |
| Schema namespace | N/A — mock data is in-memory | `execution.requests`, `execution.leases`, `execution.attempts`, `execution.receipts` + `vision.receipts` for lineage |

---

## 2. Endpoint-by-Endpoint Drift

### 2.0a `GET /api/execution/requests` — Paginated Request Listing

> **Added 2026-07-24.** Returns `{ total, limit, offset, items: RequestRow[] }`.
> Filters: `?status=&search=&limit=20&offset=0`.
> Search covers `business_key`, `title`, `objective`, `id::text`, `inputs::text`.

| Field | Client (`RequestItem`) | Backend (DB row) |
|---|---|---|
| `id` | string | `id` (UUID) ✅ |
| `status` | `RequestStatus` | `status` ✅ |
| `executor_id` | string | **not present** ❌ — executor lives on `leases`, not `requests` |
| `payload` | `Record<string, any>` | **`inputs`** (JSONB) ❌ — different name, same intent |
| `created_at` | string (ISO) | `created_at` (timestamptz) ✅ |
| `updated_at` | string (ISO) | `updated_at` (timestamptz) ✅ |
| `metadata` | `Record<string, any>` | **not present** ❌ — no metadata column |
| — | not expected | `business_key`, `title`, `intent_type`, `objective`, `deterministic`, `max_retries`, `timeout_policy`, `resource_hints`, `op_trace`, `source_plan_id`, `source_wr_id` (extra DB columns) |

**Remediation:** Rename `inputs`→`payload`. Derive `executor_id` by joining to `leases` (active lease). Drop `metadata` or add column to schema. Ignore extra DB columns or surface in UI detail.

---

### 2.0b `GET /api/execution/leases` — Paginated Lease Listing

> **Added 2026-07-24.** Returns `{ total, limit, offset, items: LeaseRow[] }`.
> Filters: `?status=&search=&limit=20&offset=0`.
> Search covers `executor_id`, `request_id::text`, `id::text`.

| Field | Client (`LeaseItem`) | Backend (DB row) |
|---|---|---|
| `id` | string | `id` (UUID) ✅ |
| `request_id` | string | `request_id` (UUID) ✅ |
| `executor_id` | string | `executor_id` ✅ |
| `status` | `LeaseStatus` | `status` ✅ |
| `acquired_at` | string (ISO) | `acquired_at` (timestamptz) ✅ |
| `expires_at` | string (ISO) | `expires_at` (timestamptz) ✅ |
| `released_at` | string \| null | `released_at` (timestamptz) ✅ |
| `promised_ttl_seconds` | number | **`ttl_seconds`** ❌ (field name) |
| `actual_ttl_seconds` | number \| null | **not returned** ❌ — compute as `(COALESCE(released_at, NOW()) - acquired_at)` |
| `lifecycle_state` | `LifecycleState` | **not returned** ❌ — compute from status + timestamps |
| — | not expected | `created_at` (extra DB column) |

**Remediation:** Rename `ttl_seconds`→`promised_ttl_seconds`. Compute `actual_ttl_seconds` and `lifecycle_state` client-side (or add computed columns to query).

---

### 2.0c `GET /api/execution/attempts` — Paginated Attempt Listing

> **Added 2026-07-24.** Returns `{ total, limit, offset, items: AttemptRow[] }`.
> Filters: `?status=&search=&limit=20&offset=0`.
> Search covers `executor_id`, `error`, `request_id::text`, `lease_id::text`, `id::text`.

| Field | Client (`AttemptItem`) | Backend (DB row) |
|---|---|---|
| `id` | string | `id` (UUID) ✅ |
| `request_id` | string | `request_id` (UUID) ✅ |
| `lease_id` | string | `lease_id` (UUID) ✅ |
| `status` | `AttemptStatus` | `status` ✅ |
| `executor_id` | string | `executor_id` ✅ |
| `attempt_number` | number | **not returned** ❌ — derive as ROW_NUMBER() OVER (PARTITION BY request_id ORDER BY created_at) |
| `started_at` | string (ISO) | `started_at` (timestamptz) ✅ |
| `finished_at` | string \| null | **`completed_at`** ❌ (field name) |
| `error_message` | string \| null | **`error`** ❌ (field name) |
| — | not expected | `result` (JSONB), `exit_code` (int), `created_at` (extra DB columns) |

**Remediation:** Rename `completed_at`→`finished_at`, `error`→`error_message`. Compute `attempt_number` client-side or via window function in query. `result` and `exit_code` are useful — add to `AttemptItem` or ignore.

---

### 2.0d `GET /api/execution/receipts` — Paginated Receipt Listing

> **Added 2026-07-24.** Returns `{ total, limit, offset, items: ReceiptRow[] }`.
> Filters: `?type=&search=&limit=20&offset=0` (uses `type` not `event_type`).
> Search covers `agent_role`, `summary`, `request_id::text`, `attempt_id::text`, `id::text`.

| Field | Client (`ReceiptItem`) | Backend (DB row) |
|---|---|---|
| `id` | string | `id` (UUID) ✅ |
| `request_id` | string | `request_id` (UUID) ✅ |
| `attempt_id` | string | `attempt_id` (UUID) ✅ |
| `lease_id` | string | **not present** ❌ — not on `execution.receipts` schema |
| `event_type` | `ReceiptEventType` | **`type`** ❌ (field name) |
| `created_at` | string (ISO) | **`issued_at`** ❌ (field name) |
| `lineage_source` | string \| null | `lineage_source` ✅ |
| `lineage_original_id` | string \| null | `lineage_original_id` ✅ |
| `payload` | `Record<string, any>` | **`metadata`** ❌ (field name) |
| — | not expected | `agent_role`, `summary` (extra DB columns) |

**Remediation:** Rename `type`→`event_type`, `issued_at`→`created_at`, `metadata`→`payload`. Derive `lease_id` from a join to `attempts`. Filter param is `?type=` not `?event_type=`.

---

### 2.1 `GET /health` — Root Readiness Check

| Field | Client (`RootHealthCheck`) | Backend |
|---|---|---|
| `status` | `ok` / `error` | `ok` / `error` ✅ |
| `database` | `connected` / `disconnected` / `mocked` (string) | **`db`** (boolean `true`/`false`) ❌ |
| `tables` | `{ requests, leases, attempts, receipts }` (flat) | **`counts`** `{ requests, leases, attempts, receipts }` (nested) ❌ |
| — | not expected | `schema: "execution"` (extra field) |
| — | not expected | `counts` wrapper object |

**Remediation:** Map `backend.db` → `client.database` (boolean→string), unwrap `backend.counts` into `client.tables`.

---

### 2.2 `GET /api/execution/health` — Inline Health

| Field | Client (`ExecutionInlineHealth`) | Backend |
|---|---|---|
| `status` | `healthy` / `degraded` | not returned ❌ |
| `stale_active_leases` | number | **`stale_active_leases`** ✅ |
| `running_attempts` | number | **`running_attempts`** ✅ |
| `total_requests` | number | **`requests`** ❌ (field name) |
| `total_leases` | number | **`leases`** ❌ |
| `total_attempts` | number | **`attempts`** ❌ |
| `total_receipts` | number | **`receipts`** ❌ |
| `scan_status` | `'pathologies_detected'` / `'clean'` | not returned ❌ |
| — | not expected | `scanned_at`, `ready_requests`, `completed_requests` (extra fields) |

**Remediation:** Rename backend key `requests`→`total_requests`, `leases`→`total_leases`, `attempts`→`total_attempts`, `receipts`→`total_receipts`. Derive `status` and `scan_status` from `stale_active_leases`.

---

### 2.3 `GET /api/execution/requests/:id/state` — Request State

| Field | Client (`RequestStateResponse`) | Backend |
|---|---|---|
| `request` | `RequestItem` | `request` ✅ |
| `lease` | `LeaseItem \| null` | **`current_lease`** ❌ (key name) |
| `latest_attempt` | `AttemptItem \| null` | `latest_attempt` ✅ |
| `receipts` | `ReceiptItem[]` | `receipts` ✅ |
| — | not expected | `receipt_count` (extra field) |
| — | backend uses `issued_at` for receipt ordering | not in client types |

**Remediation:** Map `backend.current_lease` → `client.lease`.

---

### 2.4 `GET /api/execution/leases/stale` — Stale Leases

| Field | Client | Backend |
|---|---|---|
| return type | `LeaseItem[]` (flat array) | **`{ count, stale_leases: [...] }`** (wrapped object) ❌ |
| lease ID field | `id` | **`lease_id`** ❌ |
| TTL field | `promised_ttl_seconds` | **`ttl_seconds`** ❌ |
| — | not expected | `overdue_seconds`, `business_key`, `title`, `request_status` (extra fields) |

**Remediation:** Unwrap `backend.stale_leases` array, rename `lease_id`→`id`, `ttl_seconds`→`promised_ttl_seconds`. Missing `expires_at` and `promised_ttl_seconds` in backend response for individual lease items — uses `ttl_seconds` instead.

---

### 2.5 `GET /api/execution/leases/:id/lifecycle` — Lease Lifecycle

| Field | Client (`LeaseLifecycleResponse`) | Backend |
|---|---|---|
| `promised_ttl_seconds` | number | **`promised_ttl_seconds`** ✅ |
| `actual_ttl_seconds` | number \| null | **`actual_held_seconds`** ❌ (field name) |
| `expiry_gap_seconds` | number | **`overdue_seconds`** ❌ (field name) |
| `lifecycle_state` | `LifecycleState` | **`lifecycle_state`** ✅ |
| `released_at` | string \| null | `released_at` ✅ |

**Additional backend fields:** `ttl_seconds`, `created_at`, `updated_at`.

**Remediation:** Rename `actual_held_seconds`→`actual_ttl_seconds`, `overdue_seconds`→`expiry_gap_seconds`.

---

### 2.6 `GET /api/execution/health/integrity-scan` — Integrity Scan

| Field | Client (`IntegrityScanResponse`) | Backend |
|---|---|---|
| `scanned_at` | ISO string | `scanned_at` ✅ |
| `total_pathologies` | number | **`totals.kinds_fired`** ❌ (nested) |
| `total_issues_count` | number | **`totals.anomalies`** ❌ (nested) |
| `items` | `PathologyItem[]` | **`scans`** ❌ (key name) |
| — | not expected | `schema: "execution"` (extra field) |

**PathologyItem shape drift:**

| Field | Client (`PathologyItem`) | Backend (`scans[].kind`) |
|---|---|---|
| `kind` | enum | ✅ |
| `count` | number | ✅ |
| `severity` | `CRITICAL \| WARNING \| INFO` | not returned ❌ |
| `title` | string | not returned ❌ |
| `description` | string | not returned ❌ |
| `samples` | `Record<string, any>[]` | `samples` (different shape — `{ entity_id, request_id, detail }`) ❌ |

**Remediation:** Rename `scans`→`items`, flatten `totals.anomalies`→`total_issues_count`, `totals.kinds_fired`→`total_pathologies`. Add severity/title/description mapping client-side. Remap sample shape.

---

### 2.7 `GET /api/execution/requests/:id/attempts` — Attempts Tree

| Field | Client (`RequestAttemptsTree`) | Backend |
|---|---|---|
| `request_id` | string | not in response ❌ |
| `attempts[].attempt` | `AttemptItem` | — |
| `attempts[].lease` | `LeaseItem \| null` | each `attempts[]` row has `lease` as `row_to_json(l)` (nested object) ❌ partial |
| `attempts[].receipts` | `ReceiptItem[]` | not returned ❌ |

| — | not expected | `request` metadata object |
| — | not expected | `attempt_count` |

**Remediation:** Backend doesn't include receipts per attempt — client has a richer tree model. Backend embeds `lease` as a nested JSON object on each attempt row.

---

### 2.8 `GET /api/execution/requests/:id/receipts/lineage` — Receipts Lineage

| Field | Client (`RequestLineageBuckets`) | Backend |
|---|---|---|
| `request_id` | string | not returned ❌ |
| `native` | `ReceiptItem[]` | **`lineage_buckets.native`** ❌ (wrapped) |
| `backfilled` | `ReceiptItem[]` | **`lineage_buckets.backfilled`** ❌ |
| `unknown` | `ReceiptItem[]` | **`lineage_buckets.unknown`** ❌ |

| — | not expected | `request` metadata, `receipt_count`, `native_count`, `backfilled_count`, `unknown_count` |

**Remediation:** Unwrap `backend.lineage_buckets.*`.

---

### 2.9 `GET /api/execution/health/by-executor` — Fleet View

**Without `?executor_id=` (summary mode):**

| Field | Client (`ExecutorFleetSummary`) | Backend (summary) |
|---|---|---|
| `executor_id` | string | `executor_id` ✅ |
| `active_leases_count` | number | **`active_leases`** ❌ |
| `in_progress_attempts_count` | number | not returned ❌ |
| `total_requests_handled` | number | not returned ❌ |
| `health_status` | enum | not returned ❌ |
| `last_heartbeat` | string | not returned ❌ |

| — | not expected | `released_leases`, `expired_leases`, `total_leases` (extra fields) |

**With `?executor_id=` (detail mode):**

| Field | Client (`ExecutorFleetDetail`) | Backend (detail) |
|---|---|---|
| `summary` | `ExecutorFleetSummary` | **`summary`** (different shape: `active_leases`, `released_leases`, `expired_leases`, `requests_held`, `total_leases`) ❌ |
| `active_leases` | `LeaseItem[]` | **`active_leases`** (includes `r.business_key`, `r.title`, `r.status` as `request_status`) ❌ |
| `in_progress_attempts` | `AttemptItem[]` | **`in_progress_attempts`** ✅ |
| `recent_completed_count` | number | not returned ❌ |
| `recent_failed_count` | number | not returned ❌ |

**Remediation:** Map field names, compute derived fields client-side.

---

### 2.10 `GET /api/execution/health/status-distribution` — Status Distribution

| Field | Client (`StatusDistributionResponse`) | Backend |
|---|---|---|
| `requests` | `Record<RequestStatus, number>` | **`[{status, count}]`** ❌ (array vs map) |
| `leases` | `Record<LeaseStatus, number>` | **`[{status, count}]`** ❌ |
| `attempts` | `Record<AttemptStatus, number>` | **`[{status, count}]`** ❌ |
| `receipts` | `Record<ReceiptEventType, number>` | **`receipts_by_type`** ❌ (key name + array format) |
| — | not expected | `stale_active_leases` | |

**Remediation:** Convert backend arrays `[{status, count}, ...]` → client maps `{ STATUS: count, ... }`. Rename `receipts_by_type` → `receipts`.

---

### 2.11 `GET /api/execution/receipts/:id/pipeline-origin` — Pipeline Origin

| Field | Client (`PipelineOriginResponse`) | Backend |
|---|---|---|
| `receipt_id` | string | not returned ❌ |
| `relationship` | string | `relationship` ✅ |
| `execution_receipt` | `ReceiptItem` | **`local_execution_record.record`** ❌ (wrapped) |
| `vision_receipt` | `ReceiptItem \| null` | **`remote_vision_record.record`** \| `null` ❌ (wrapped) |
| `diff_fields` | `[{field, execution_value, vision_value, matches}]` | not returned ❌ |

| — | not expected | `local_execution_record.audit_trail`, `remote_vision_record.audit_trail` |

**Remediation:** Unwrap `local_execution_record.record` → `execution_receipt`, `remote_vision_record.record` → `vision_receipt`. Derive `diff_fields` client-side.

---

## 3. Client-Only Features (Mock Data Only)

These features exist only in the client's mock data layer and have **no backend endpoint**:

| Feature | Method | Description |
|---|---|---|
| Dashboard pathology inferences | implicit in `DashboardView` | Derives severity, title, description from scan kind |
| Fleet health status computation | `getFleetByExecutor` summary fields | `health_status`, `last_heartbeat`, `in_progress_attempts_count`, `total_requests_handled` — derived fields, not in backend response |

> **Resolved (2026-07-24):** Paginated `list*` endpoints (`listRequests`, `listLeases`, `listAttempts`, `listReceipts`) are now backed by `GET /api/execution/{requests,leases,attempts,receipts}`. See §2.0a–§2.0d for shape drift.
>
> **Note:** Fleet detail for single executor already exists at `GET /api/execution/health/by-executor?executor_id=` — §2.9 documents the shape drift for that endpoint.

---

## 4. Receipt Schema Drift

| Field | Client (`ReceiptItem`) | Backend (SQL table) |
|---|---|---|
| `created_at` | string (ISO) | `issued_at` (timestamptz) ❌ |
| `event_type` | enum string | `type` (text) ❌ |
| `payload` | `Record<string, any>` | `payload` (jsonb) ✅ |
| `lineage_source` | string \| null | `lineage_source` (text) ✅ |
| `lineage_original_id` | string \| null | `lineage_original_id` (text) ✅ |

**Remediation:** Map `issued_at` → `created_at`, `type` → `event_type`.

---

## 5. Summary of Changes Required for Live Mode

| Priority | Area | Changes |
|---|---|---|
| **Critical** | New list endpoints (§2.0a–§2.0d) | Wire `apiClient.list*` methods to real HTTP calls, apply field-name mappings (see each subsection) |
| **Critical** | Response wrapper unwrapping | Unwrap `current_lease`, `counts`, `stale_leases`, `scans`, `lineage_buckets`, `local_execution_record`, `remote_vision_record` |
| **Critical** | Field name mappings | Rename `db`→`database`, `actual_held_seconds`→`actual_ttl_seconds`, `overdue_seconds`→`expiry_gap_seconds`, `lease_id`→`id`, `ttl_seconds`→`promised_ttl_seconds`, `requests`→`total_requests`, etc. |
| **High** | Array→map conversion | Convert `{status, count}[]` arrays to `Record<string, number>` maps for status-distribution endpoints |
| **High** | Receipt field rename | `issued_at`→`created_at`, `type`→`event_type` |
| **Medium** | Missing fields | Compute `severity`, `title`, `description` for pathology items client-side; compute `attempt_number`, `lifecycle_state` for list rows |
| **Low** | Client-only features | Dashboard pathology inferences, fleet health-status derivation — pure client-side logic |
