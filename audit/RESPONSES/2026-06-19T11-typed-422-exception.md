---
project: nexus
session: peb-kernel-execution-evening
parent_prompt: 2026-06-19T11-typed-422-exception.md
---

# Response: 422 mapping narrowed to typed `MalformedAdmissionRequestException`

## Files changed (1 new, 2 edited)

| path | change |
|------|--------|
| `peb-domain/src/main/java/org/nexus/peb/domain/exception/MalformedAdmissionRequestException.java` (NEW) | New package `org.nexus.peb.domain.exception`. Typed subclass of `RuntimeException`. Two constructors (message, message+cause). JavaDoc explains the HTTP-422 semantics and why a typed subclass exists instead of catching the broad IAE parent. |
| `peb-core/src/main/java/org/nexus/peb/core/violation/PebViolationEngine.java` | Added `import org.nexus.peb.domain.exception.MalformedAdmissionRequestException;`. Five `throw new IllegalArgumentException(...)` sites inside `ingest()` (null input, missing `violation_type`, missing `severity`, unknown `violation_type` enum, unknown `severity` enum) now `throw new MalformedAdmissionRequestException(...)`. Inner `IllegalArgumentException` catches from `ViolationType.valueOf(...)` / `ViolationSeverity.valueOf(...)` are preserved as the catch source (the inner IAE is caught and rethrown with the typed wrapper, original cause attached). |
| `peb-api/src/main/java/org/nexus/peb/api/controller/AdmissionControllerFacade.java` | Added `import org.nexus.peb.domain.exception.MalformedAdmissionRequestException;`. Method renamed `handleIllegalArgument` → `handleMalformedAdmissionRequest`, parameter type `IllegalArgumentException` → `MalformedAdmissionRequestException`, annotation narrowed from `@ExceptionHandler(IllegalArgumentException.class)` → `@ExceptionHandler(MalformedAdmissionRequestException.class)`. JavaDoc expanded to explain the scoping rationale (programmer bugs should bubble 500, not be silently labelled 422). |

## Typecheck

`mvn clean install -B -ntp` → BUILD SUCCESS, all 9 modules in ~3.6 s.

## Smoke test (real MCP facade -> kernel -> Postgres)

Re-ran the existing `smoke.ts` against the freshly built kernel. Three calls
plus DB verification:

| call | controller-layer response verifier | DB landing |
|----|----|----|
| `peb_record_decision` (MUTATE) | request reached kernel, processed | 1 `peb_transactions` row, `admission_result=ALLOWED`, `tool_name=peb_record_decision` |
| `peb_report_violation` valid (`authority_leakage` / `hard`) | request reached kernel, processed | 1 `peb_transactions` row, `admission_result=REJECTED`; 1 `peb_violations` row, `violation_type=AUTHORITY_LEAKAGE`, `severity=HARD`, `resolution=REJECTED`, linked by `transaction_id` |
| `peb_report_violation` malformed (missing `violation_type`) | `PEB Kernel Error [422]: Malformed admission request: peb_report_violation requires a textual 'violation_type' field` | **0 rows** (rolled back by outer `@Transactional`) |

DB counts post-smoke:
```
audit_rows     = 2   (1 MUTATE + 1 valid violation)
violation_rows = 1   (only the valid violation)
```

The body string `Malformed admission request: ...` confirms the typed
exception's message is now flowing through the narrowed handler. Bare
`IllegalArgumentException`s from elsewhere in the stack — programmer bugs,
JDK validation, future code paths — will not be caught by this handler and
will surface unmapped as HTTP 500.

## Critiques now resolved

| critique (from prior reviewer turn) | status |
|----|----|
| `@ExceptionHandler(IllegalArgumentException.class)` is too broad — programmer bugs get silently mapped to 422 | **resolved this turn** with the typed subclass + narrowed handler |

## Critiques still open (logged as followups)

| critique | impact | disposition |
|----|----|----|
| **PebApiClient response parsing** — `response.json()` on a plain-text body gives the facade a fake-error object even when the kernel succeeds | medium | followup: switch happy-path to `response.text()` |
| **Enum translation in `PebViolationEngine.ingest`** — scattered regex `_VIOLATION$` strip | low | followup: move parsers onto enum classes (`ViolationType.fromMcpValue(String)`, `ViolationSeverity.fromMcpValue(String)`) |
| **`PebTransaction.createdAt` default-fill at engine layer** — fragile to future INSERT paths that bypass the engine | low | followup: `@PrePersist` on `PebTransaction`, or Flyway SQL `DEFAULT now()` |
| **Three `@Transactional` semantics drift in `PebTransactionEngine` documentation** — `beginTransaction` / `commitTransaction` now join outer scope rather than opening new ones | low | followup: refresh JavaDoc on `PebTransactionEngine` |
| **No `peb_violations` UNIQUE constraint on `transaction_id`** — MCP retries can produce duplicate rows | medium | followup: discuss dedup semantics with the user |
| **No `@DataJpaTest` for `PebViolationEngine.ingest`** | medium | followup |
| **HTTP 200 for validator-denied VALIDATE/MUTATE calls** | low | followup: confirm with user |
