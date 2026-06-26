---
project: nexus
session: peb-kernel-execution-evening
parent_prompt: 2026-06-19T12-enum-frommcpvalue.md
---

# Response: bridge shape now lives on `ViolationType` / `ViolationSeverity`

## Files changed (3)

| path | change |
|------|--------|
| `peb-domain/src/main/java/org/nexus/peb/domain/enums/ViolationType.java` | Body now extends the type (semicolon-terminated). Added `public static ViolationType fromMcpValue(String raw)`: null-or-blank → `MalformedAdmissionRequestException`; otherwise `raw.trim().toUpperCase().replaceAll("_VIOLATION$", "")` then `ViolationType.valueOf(...)`. Inner IAE is caught and rethrown as `MalformedAdmissionRequestException` with the original raw value attached and the IAE preserved as cause. JavaDoc explains the MCP→Java convention (`authority_leakage` → `AUTHORITY_LEAKAGE`, `rcl_violation` → `RCL`). |
| `peb-domain/src/main/java/org/nexus/peb/domain/enums/ViolationSeverity.java` | Same shape as `ViolationType.fromMcpValue` but for `HARD`/`SOFT`. Body extends the type with `;`. Trim + uppercase + `valueOf`; null/blank/unknown → `MalformedAdmissionRequestException`. |
| `peb-core/src/main/java/org/nexus/peb/core/violation/PebViolationEngine.java` | The 19-line inline `try { valueOf } catch { throw typed }` block is gone. Replaced with two single-line factory calls: `ViolationType violationType = ViolationType.fromMcpValue(vTypeNode.asText());` and `ViolationSeverity severity = ViolationSeverity.fromMcpValue(vSevNode.asText());`. Doc comment refreshed to point readers at the factory methods on the enums. |

## Typecheck

`mvn clean install -B -ntp` → BUILD SUCCESS, all 10 modules in ~17.7 s.

## Smoke test (real MCP facade -> kernel -> Postgres)

The MCP smoke was re-run against the freshly built kernel with the new
factories. Three calls + DB verification:

| call | controller-layer response verifier | DB landing |
|----|----|----|
| `peb_record_decision` (MUTATE) | request reached kernel, processed | 1 `peb_transactions` row, `admission_result=ALLOWED`, `tool_name=peb_record_decision` |
| `peb_report_violation` valid (`authority_leakage` / `hard`) | request reached kernel, processed | 1 `peb_transactions` row; 1 `peb_violations` row, `violation_type=AUTHORITY_LEAKAGE`, `severity=HARD` (proves the new factories parse the lowercase MCP input correctly) |
| `peb_report_violation` malformed (missing `violation_type`) | `PEB Kernel Error [422]: Malformed admission request: peb_report_violation requires a textual 'violation_type' field` (via the typed handler) | **0 rows** (rolled back by outer `@Transactional`) |

DB counts post-smoke:
```
audit_rows     = 2   (1 MUTATE + 1 valid violation)
violation_rows = 1   (only the valid violation)
```

These counts are identical to the pre-refactor counts; the enum refactor is
behaviorally a no-op.

### On the `Unexpected token` client errors

The smoke's reported `Unexpected token 'M', "Mutation processed" is not valid
JSON` and `Unexpected token 'V', "Violation ..." is not valid JSON` happen at
the **PebApiClient TS client** layer, not at the kernel. They are the
pre-existing, separately tracked bug: `PebApiClient.submitTransaction` calls
`response.json()` on a `ResponseEntity<String>` kernel response (which is
plain text like `"Mutation processed"`), the JSON parser throws on the
non-JSON body, and the existing try/catch in `submitTransaction` returns the
failing call as a `{error: true, admission_result: "error", ...}` object.
The kernel actually processed the calls; the rows in `peb_transactions` and
`peb_violations` prove it. This issue is unrelated to the enum refactor and
remains a logged followup (`PebApiClient response parsing`).

## Unit-testability

The bridge shape is now exercisable without spinning the kernel:

```java
assertEquals(ViolationType.AUTHORITY_LEAKAGE, ViolationType.fromMcpValue("authority_leakage"));
assertEquals(ViolationType.RCL,               ViolationType.fromMcpValue("rcl_violation"));
assertEquals(ViolationType.STATE_DEPENDENCY,  ViolationType.fromMcpValue("STATE_DEPENDENCY")); // already-uppercase also accepted
assertEquals(ViolationSeverity.HARD,          ViolationSeverity.fromMcpValue("hard"));

assertThrows(MalformedAdmissionRequestException.class, () -> ViolationType.fromMcpValue(null));
assertThrows(MalformedAdmissionRequestException.class, () -> ViolationType.fromMcpValue(""));
assertThrows(MalformedAdmissionRequestException.class, () -> ViolationType.fromMcpValue("not_a_real_type"));
```

## Critiques now resolved

| critique (from prior reviewer turn) | status |
|----|----|
| Enum-translation regex `_VIOLATION$` strip in `PebViolationEngine.ingest` is brittle + scattered | **resolved this turn** with `fromMcpValue` factories on the enums |

## Critiques still open (logged as followups)

| critique | impact | disposition |
|----|----|----|
| **PebApiClient response parsing** — `response.json()` on a plain-text body gives the facade a fake-error object even when the kernel succeeds | medium | followup: switch PebApiClient happy path to `response.text()` |
| **`PebTransaction.createdAt` default-fill at engine layer** — fragile to future INSERT paths that bypass the engine | low | followup: `@PrePersist` on `PebTransaction`, or Flyway SQL `DEFAULT now()` |
| **PebTransactionEngine.beginTransaction / commitTransaction naming** — they no longer open separate transactions when called inside the outer `@Transactional` | low | followup: refresh JavaDoc |
| **No `peb_violations` UNIQUE constraint on `transaction_id`** — MCP retries can produce duplicate rows | medium | followup: discuss dedup semantics |
| **No `@DataJpaTest` / unit tests for `ViolationType.fromMcpValue` and `ViolationSeverity.fromMcpValue`** | medium | followup: ship a small test class to lock the bridge shape |
| **HTTP 200 for validator-denied VALIDATE/MUTATE calls** | low | followup: confirm with user |
