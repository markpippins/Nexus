# Bitemporal API Changes — UI Integration Guide

> **Date:** 2026-08-01  
> **Scope:** All 25 nebula tables refactored for bitemporal semantics  
> **Commits:** `435a9a8` (refactor), `3c301e2` (substance/voyager/systemd)

---

## Summary

Every table in the `nebula` schema now has temporal columns (`valid_from`, `valid_until`, `recorded_on_dt`, `recorded_until_dt`). Domain-object tables were renamed to `_history` and replaced with auto-updatable VIEWs. Join tables kept their names with partial unique indexes.

**For the UI:** Most SELECT/INSERT operations work identically through the VIEWs. The breaking changes are:

1. **DELETE endpoints now return `{expired: true}` instead of `{ok: true}`**
2. **POST cross-reference returns 409 on conflict instead of 500**
3. **All timestamp fields in responses are now epoch milliseconds**
4. **conduit-mcp `hardDeletePlan` return type changed**

---

## Breaking API Changes

### 1. DELETE Response Shape

**Affected endpoints:**

| Endpoint | Old Response | New Response |
|----------|-------------|-------------|
| `DELETE /api/requirements/:id/dependencies/:depId` | `{ok: true}` | `{expired: true}` |
| `DELETE /api/harvests/:id` | `{ok: true}` | `{expired: true}` |
| `DELETE /api/agent-records/:id` | `{ok: true}` | `{expired: true}` |
| `DELETE /api/projections/:id` | `{ok: true}` | `{expired: true}` |
| `DELETE /api/cross-references/:id` | `{ok: true}` (204) | `{expired: true}` (200) |
| `DELETE /api/artifact-provenance/:id` | `{ok: true}` | `{expired: true}` |

**Fix:** Check for `response.expired` instead of `response.ok` in DELETE handlers. If your code does something like:
```ts
if (response.ok) { removeFromUI(); }
```
Change it to:
```ts
if (response.expired) { removeFromUI(); }
```

### 2. POST Cross-Reference Conflict Handling

**Endpoint:** `POST /api/cross-references`

| Scenario | Old Behavior | New Behavior |
|----------|-------------|-------------|
| New cross-reference | 201 Created | 201 Created (unchanged) |
| Duplicate cross-reference | 500 Internal Server Error | **409 Conflict** with `{error: "Cross-reference already exists"}` |

**Fix:** Handle 409 responses gracefully. 409 means the cross-reference already exists — treat it as success (idempotent create).

### 3. conduit-mcp `hardDeletePlan` Return Type

**File:** `typescript/conduit-mcp/src/db.ts`

| Property | Old | New |
|----------|-----|-----|
| Return type | `{deleted: boolean, ticketsDeleted: number, receiptsDeleted: number}` | `{expired: boolean, ticketsDeleted: number, receiptsDeleted: number}` |

**Impact:** Low. The only caller (`tools.ts` line 1229) only accesses `ticketsDeleted` and `receiptsDeleted`, never `deleted`.

### 4. Temporal Columns in API Responses

All domain-object endpoints now return temporal columns as epoch milliseconds:

```json
{
  "id": "uuid",
  "title": "...",
  "validFrom": 1785600000000,
  "validUntil": 253402214400000,
  "recordedOnDt": 1785600000000,
  "recordedUntilDt": 253402214400000
}
```

The `validUntil` and `recordedUntilDt` values of `253402214400000` represent `9999-12-31` (infinitely valid). These columns are **additive** — no existing fields were removed or renamed.

**Impact:** If your UI code destructures responses and passes all fields to a component, the new fields will be silently present. If you have strict type checking that rejects unknown properties, add these fields to your interfaces.

---

## What Auto-Works (No Changes Needed)

These operations work identically through the VIEWs with zero frontend changes:

- **GET** all domain objects (agendas, requirements, implementation plans, etc.) — same URL, same params, same response structure (plus temporal fields)
- **POST/PATCH** create and update operations — auto-updatable VIEWs pass writes through to `_history` base tables
- **JOINs and subqueries** in API responses (e.g., dependency queries, cross-reference resolvers) — VIEWs filter expired rows automatically
- **All `nebula-srv` endpoints except the DELETEs listed above**

---

## Known Issues

### ✅ VIEW-backed DELETEs now preserve history

All identified hard deletes on VIEW-backed tables have been converted to soft-expiry operations:

```sql
UPDATE nebula.<view_name>
SET valid_until = now()
WHERE id = $1 AND valid_until > now()
```

This updates the corresponding `_history` row through PostgreSQL's auto-updatable VIEW and removes it from the current projection without physically deleting its audit history.

Affected operations:

| Endpoint / operation | Tables |
|----------|-------|
| `DELETE /api/cross-references/:id` | `cross_references` |
| `DELETE /api/harvests/:id` | `harvest_candidates`, `harvests` |
| `DELETE /api/agent-records/:id` | `agent_records` |
| `DELETE /api/projections/:id` | `projections` |
| Block segmentation delete | `segments` |
| Block segmentation delete | `projection_overrides` |

The three route handlers return `{expired: true}`. The block-segmentation service functions retain their existing typed `{ok: true}` contract. A repeated delete of an already-expired row returns the existing not-found error because of the `valid_until > now()` guard.

No known hard DELETE remains for these six VIEW-backed tables in the reviewed `nebula-srv` code paths.

### 🟡 Remaining DELETE work is outside this reviewed set

Other legacy DELETE paths may still exist on tables outside the six operations listed above. They should be audited separately; the six VIEW-backed operations covered by this change are now history-preserving.



---

## Response Shape Reference

### All Tables Now Have These Temporal Fields

Every domain object response includes:

| Field | Type | Description | Sentinel Value |
|-------|------|-------------|----------------|
| `validFrom` | epoch ms | When this version became valid | `now()` |
| `validUntil` | epoch ms | When this version was superseded | `253402214400000` (9999-12-31) |
| `recordedOnDt` | epoch ms | When this row was recorded | `now()` |
| `recordedUntilDt` | epoch ms | When this record was superseded | `253402214400000` (9999-12-31) |

**Note:** The epoch ms values come from `routes.ts` `toEpochMs()` / `camelCaseRow()` helpers which convert `Date` → `getTime()`. The sentinel timestamps will appear as very large numbers (year 9999).

### Cross-References Specific

`POST /api/cross-references` now returns **409 Conflict** (not 500) when a duplicate is submitted. The `rel_type` field is validated against `crossref-taxonomy.ts` — invalid values return 409 with a list of allowed values.

---

## Table Mapping (VIEW → _history)

If you need to write direct SQL or debug data issues, here's the mapping:

| VIEW (use in queries) | Base Table (do not query directly) |
|------------------------|-----------------------------------|
| `nebula.agendas` | `nebula.agendas_history` |
| `nebula.agenda_items` | `nebula.agenda_items_history` |
| `nebula.architect_specs` | `nebula.architect_specs_history` |
| `nebula.artifact_provenance` | `nebula.artifact_provenance_history` |
| `nebula.assessments` | `nebula.assessments_history` |
| `nebula.assessment_resolutions` | `nebula.assessment_resolutions_history` |
| `nebula.cross_references` | `nebula.cross_references_history` |
| `nebula.harvest_candidate_embeddings` | `nebula.harvest_candidate_embeddings_history` |
| `nebula.harvest_candidates` | `nebula.harvest_candidates_history` |
| `nebula.harvests` | `nebula.harvests_history` |
| `nebula.implementation_plans` | `nebula.implementation_plans_history` |
| `nebula.intent_records` | `nebula.intent_records_history` |
| `nebula.observations` | `nebula.observations_history` |
| `nebula.open_questions` | `nebula.open_questions_history` |
| `nebula.open_question_answers` | `nebula.open_question_answers_history` |
| `nebula.op_registry` | `nebula.op_registry_history` |
| `nebula.requirement_verifications` | `nebula.requirement_verifications_history` |
| `nebula.requirements` | `nebula.requirements_history` |
| `nebula.roles` | `nebula.roles_history` |
| `nebula.specifications` | `nebula.specifications_history` |
| `nebula.systems` | `nebula.systems_history` |
| `nebula.subsystems` | `nebula.subsystems_history` |
| `nebula.features` | `nebula.features_history` |
| `nebula.work_requests` | `nebula.work_requests_history` |

---

## How to Test

```bash
# Verify a VIEW returns data
curl -s 'http://localhost:3101/api/agendas?limit=3' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total','?'))"

# Verify a DELETE returns expired (not ok)
curl -s -X DELETE 'http://localhost:3101/api/artifact-provenance/00000000-0000-0000-0000-000000000000' | python3 -c "import sys,json; print(json.load(sys.stdin))"

# Verify cross-reference dedup
curl -s -X POST http://localhost:3101/api/cross-references \
  -H 'Content-Type: application/json' \
  -d '{"sourceType":"test","sourceId":"x","targetType":"test","targetId":"y","relType":"req:blocks","metadata":{}}'
# First call → 201. Second call → 409.
```

---

## Replication Status

All schema changes have been replicated to the Strontium server (`192.168.1.76`). Both servers are now at parity with 38 `_history` tables and matching VIEWs.

> **Update 2026-08-25:** Strontium has been replaced as the canonical backup
> target by **barium** (`192.168.1.212`). Strontium is down for repair and may
> return, but new schema changes replicate to barium (R9). The parity statement
> above is historical, true as of its original writing.
