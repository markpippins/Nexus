---
project: nexus
session: peb-kernel-execution-evening
parent_prompt: 2026-06-19T10-atomic-audit-violation.md
---

# Response: audit-row + violation-row are now atomic

## Files changed

One file: `/home/codex/dev/nexus/jvm/spring/peb-kernel/peb-core/src/main/java/org/nexus/peb/core/engine/PebGovernanceEngine.java`. Three replacements inside one file:

1. New import:
   ```java
   + import org.springframework.transaction.annotation.Transactional;
   ```

2. `process(PebTransaction)` annotated `@Transactional` (legacy undispatched call site; included for symmetry).

3. `processForPath(PebTransaction, AdmissionPath)` annotated `@Transactional` (the substantive change — this spans validator + audit write + first-class violation write). JavaDoc updated to call out the atomicity guarantee.

No inner refactor: the inner `@Transactional` methods (`PebTransactionEngine.beginTransaction`, `commitTransaction`, `PebViolationEngine.ingest`) keep their annotations; Spring's default `Propagation.REQUIRED` joins the outer scope when called from inside.

## Typecheck

`mvn clean install -B -ntp` → BUILD SUCCESS, all 9 modules in ~3.6s.

## Smoke test (real MCP facade -> kernel -> Postgres)

The MCP smoke (`smoke.ts`) was run against the freshly built kernel. Three
calls — `peb_record_decision`, valid `peb_report_violation`, malformed
`peb_report_violation` — and DB verification of the resulting rows:

| call (TS facade → kernel) | HTTP (controller layer) | DB landing |
|----|----|----|
| `peb_record_decision` (MUTATE path) | processed | 1 `peb_transactions` row, `admission_result=ALLOWED`, `tool_name=peb_record_decision` |
| `peb_report_violation` valid (`authority_leakage` / `hard`) | processed | 1 `peb_transactions` row, `admission_result=REJECTED`; 1 `peb_violations` row, `violation_type=AUTHORITY_LEAKAGE`, `severity=HARD`, `resolution=REJECTED`, linked by `transaction_id` |
| `peb_report_violation` malformed (missing `violation_type`) | HTTP 422 surfaced cleanly | **0 rows** — `peb_violations` and `peb_transactions` *both* rolled back |

DB counts post-smoke:
```
audit_rows     = 2   (1 MUTATE + 1 valid violation)   — was 3 before fix
violation_rows = 1   (only the valid violation)
```

The malformed case went from **1 audit-only orphan row** (pre-fix) to **0 rows** (post-fix) — exactly the rollback signature the user asked for.

## Semantic effect of the change

- **Audit and violation rows can no longer diverge.** A malformed `peb_report_violation` no longer leaves a forensic-only audit row. The kernel directly operates on the principle "both land or neither lands."
- **Validity errors during admission** (e.g., the validator stub throwing) now also produce zero rows.
- **DB-level failures** (Postgres connection drop, unique-key collision on idempotencyKey, NOT NULL violation) now produce zero rows instead of orphan rows.
- The inner `@Transactional` boundaries are now inert-but-correct: their REQUIRED propagation joins the outer transaction.

## Critiques now resolved

| critique (from prior reviewer turn) | status |
|----|----|
| Three `@Transactional` boundaries → possible partial state | **resolved this turn** |

## Critiques still open (logged as followups)

| critique | impact | disposition |
|----|----|----|
| **PebApiClient response parsing** — `response.json()` on a plain-text body gives the facade a fake-error object even when the kernel succeeds | medium | followup |
| **Enum translation in `PebViolationEngine.ingest`** — scattered regex `_VIOLATION$` strip; should live on the enum itself | low | followup |
| **`PebTransaction.createdAt` default-fill at engine layer** — fragile to future INSERT paths that bypass the engine | low | followup |
| **`@ExceptionHandler(IllegalArgumentException.class)` is too broad** | low | followup |
| **No `peb_violations` UNIQUE on `transaction_id`** — MCP retries create duplicate violation rows | medium | followup |
| **No `@DataJpaTest` for `PebViolationEngine.ingest`** | medium | followup |
| **HTTP 200 for validator-denied VALIDATE/MUTATE** | low | followup |
| **Inner `beginTransaction` / `commitTransaction` naming is now misleading** — they no longer open separate transactions | low | followup: refresh JavaDoc on PebTransactionEngine |
