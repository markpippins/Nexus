---
project: nexus
session: peb-kernel-execution-evening
parent_prompt: 2026-06-19T13-prepersist-createdat.md
---

# Response: createdAt default now lives on PebTransaction as a `@PrePersist` callback

## Files changed (2)

| path | change |
|------|--------|
| `peb-domain/src/main/java/org/nexus/peb/domain/entity/PebTransaction.java` | Added `import jakarta.persistence.PrePersist;`. Added `protected void onCreate()` annotated `@PrePersist` that fills `createdAt` with `Instant.now()` when currently null. JavaDoc explains the requirement (MCP facade doesn't stamp createdAt; callers that do are still respected because the null-check wins). |
| `peb-core/src/main/java/org/nexus/peb/core/engine/PebGovernanceEngine.java` | Removed the 4-line inline `if (request.getCreatedAt() == null) request.setCreatedAt(Instant.now());` from `processForPath`. Removed the now-unused `import java.time.Instant;`. |

A follow-up spec fix (per code-reviewer): `@PrePersist` lifecycle callbacks
should not be `private` in the JPA spec (Hibernate invokes them but other
providers may not). The method visibility was widened to `protected`. Same
behavior, broader provider coverage.

## Typecheck

`mvn clean install -B -ntp` → BUILD SUCCESS, all 10 modules in ~13.6 s.

## Smoke test (real MCP facade -> kernel -> Postgres)

The MCP smoke was re-run against the freshly built kernel. Three calls + DB
verification:

| call | controller-layer | DB landing | createdAt source |
|----|----|----|----|
| `peb_record_decision` (MUTATE) | processed | 1 `peb_transactions` row, `admission_result=ALLOWED` | `Instant.now()` via `@PrePersist onCreate()` (facade didn't stamp) |
| `peb_report_violation` valid (`authority_leakage` / `hard`) | processed | 1 `peb_transactions` row, `admission_result=REJECTED`; 1 `peb_violations` row, `violation_type=AUTHORITY_LEAKAGE`, `severity=HARD` | `Instant.now()` via `@PrePersist onCreate()` |
| `peb_report_violation` malformed (missing `violation_type`) | `PEB Kernel Error [422]: Malformed admission request: peb_report_violation requires a textual 'violation_type' field` | **0 rows** (rolled back by outer `@Transactional`) | N/A |

DB counts post-smoke:
```
audit_rows     = 2   (1 MUTATE + 1 valid violation)
violation_rows = 1   (only the valid violation)
```

Identical to pre-refactor counts. Behavior preserved end-to-end.

### On the client-side `Unexpected token` errors in the smoke

Same recurring surfacing of the **`PebApiClient` response-parsing bug**
(documented as a followup from a prior turn): `PebApiClient.submitTransaction`
calls `response.json()` on a `ResponseEntity<String>` kernel response (plain
text like `"Mutation processed"`), the JSON parser throws, the existing
try/catch returns a `{error: true, ...}` object. Kernel actually processed
the calls; DB rows prove it. Unrelated to this turn's refactor.

## Why not `@CreationTimestamp`?

Hibernate's `org.hibernate.annotations.CreationTimestamp` would auto-stamp a
single field annotation, removing the imperative null-check. Considered and
**rejected**: `@CreationTimestamp` always overwrites the column on insert,
including any caller-supplied `createdAt`. The `@PrePersist` null-fill approach
preserves caller-supplied timestamps (e.g., historical curl smoke tests that
sent `"createdAt":"2026-06-19T05:50:00Z"`), so it matches the established
contract. Logged as a followup if a caller-supplied-timestamp regression is
ever acceptable.

## Critiques now resolved

| critique (from prior reviewer turn) | status |
|----|----|
| `PebTransaction.createdAt` default-fill at engine layer is fragile to future INSERT paths that bypass the engine | **resolved this turn** with `@PrePersist onCreate()` on the entity |

## Critiques still open (logged as followups)

| critique | impact | disposition |
|----|----|----|
| **PebViolation.createdAt** is still filled manually in `PebViolationEngine.ingest`, with the same NOT NULL risk for any future call site that bypasses ingest | low — works today | followup: parallel `@PrePersist` (or `@CreationTimestamp`) on `PebViolation` |
| **PebApiClient response parsing** — `response.json()` on a plain-text body gives the facade a fake-error object even when the kernel succeeds | medium | followup: switch PebApiClient happy path to `response.text()` |
| **PebTransactionEngine.beginTransaction / commitTransaction JavaDoc** is now stale — they no longer open separate transactions when called inside the outer `@Transactional` | low | followup: refresh JavaDoc |
| **No `peb_violations` UNIQUE constraint on `transaction_id`** — MCP retries can produce duplicate rows | medium | followup |
| **No `@DataJpaTest`/`@WebMvcTest`** for the new `@PrePersist` callback or the typed 422 mapping | medium | followup |
| **HTTP 200 for validator-denied VALIDATE/MUTATE calls** | low | followup: confirm with user |
