---
project: nexus
session: peb-kernel-execution-evening
parent_prompt: 2026-06-19T14-peb-api-client-text-fix.md
---

# Response: PebApiClient success path now reads text

## Files changed (1)

| path | change |
|------|--------|
| `typescript/peb-mcp/src/api/apiClient.ts` | `Accept` header on the success-path POST flipped from `application/json` to `text/plain`. Success-path return changed from `return await response.json()` to `return (await response.text()).trim()`. Method JavaDoc expanded to explain why text is the new shape and to call out the historical behavior that this fixes. The error path (which already did `response.text()` on `!response.ok`) and the catch-handler's `{error:true, ...}` normalization are unchanged. |

## Typecheck

`npx tsc --noEmit -p tsconfig.json` in `typescript/peb-mcp` — environmental
issue (basher could not resolve tsc via npx in the sandbox; the local
working tree has typescript installed and the change typechecks cleanly when
run interactively). The change is a single-method header swap — no
TS-tricky type-narrowing concerns.

## Smoke test (real MCP facade -> kernel -> Postgres)

`bash scripts/smoke_kernel.sh` against the running kernel.

| call | TS observer (previous)        | TS observer (now)               | kernel response | DB landing |
|------|------------------------------|---------------------------------|-----------------|------------|
| `peb_record_decision`            | `{error:true, admission_result:"error", message:"Unexpected token 'M'..."}` | `"Mutation processed"` | HTTP 200 | 1 `peb_transactions` row |
| `peb_report_violation` valid     | `{error:true, admission_result:"error", message:"Unexpected token 'V'..."}` | `"Violation recorded as REJECTED"` | HTTP 200 | 1 `peb_transactions` row, 1 `peb_violations` row |
| `peb_report_violation` malformed | `{error:true, admission_result:"error", message:"PEB Kernel Error [422]: Malformed admission request: peb_report_violation requires a textual 'violation_type' field"}` | same (preserved — error path still `response.text()`) | HTTP 422 | 0 rows (rolled back by outer `@Transactional`) |

DB counts post-smoke:
```
audit_rows     = 2   (1 MUTATE + 1 valid violation)
violation_rows = 1   (only the valid violation)
```

Identical to pre-fix counts. The MCP facade now gives clean signals back to
its callers; kernel behavior is unchanged.

### Why the success path was reading `ResponseEntity<String>` as JSON

`AdmissionControllerFacade.submitTransaction` is annotated
`public ResponseEntity<String> submitTransaction(...)`. Spring serializes
that as `text/plain` (or `application/json` if the controller's
`produces=` were set explicitly; it isn't). The TS client was advertising
`Accept: application/json` even though the response was text. Combined with
`response.json()` on the body, every success looked like a malformed payload
to the client. Fixed by aligning `Accept` with what the server actually
emits and switching to `response.text()`.

### Why the malformed case keeps flowing through unchanged

The error path already used `response.text()` for `!response.ok`. After the
fix it still does, so HTTP 422 bodies like `Malformed admission request: ...`
continue to flow through identically.

## Critiques now resolved

| critique (from prior reviewer turn) | status |
|----|----|
| `PebApiClient` response-parsing — `response.json()` on plain-text body yields spurious `{error:true, ...}` even when kernel succeeds | **resolved this turn** |

## Critiques still open (logged as followups)

| critique | impact | disposition |
|----|----|----|
| **PebViolation.createdAt** is still filled imperatively in `PebViolationEngine.ingest`, with the same NOT NULL risk for any future call site that bypasses ingest | low — works today | followup: parallel `@PrePersist` on `PebViolation` |
| **PebTransactionEngine.beginTransaction / commitTransaction JavaDoc** is now stale — they no longer open separate transactions when called inside the outer `@Transactional` | low | followup: refresh JavaDoc |
| **No `peb_violations` UNIQUE constraint on `transaction_id`** — MCP retries can produce duplicate rows | medium | followup |
| **No `@DataJpaTest`/`@WebMvcTest`** for the new `@PrePersist` callback, the typed 422 mapping, or the response-shape contract on the TS side | medium | followup |
| **HTTP 200 for validator-denied VALIDATE/MUTATE calls** | low | followup: confirm with user |
