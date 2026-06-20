---
project: nexus
session: peb-kernel-execution-evening
parent_prompt: 2026-06-19T08-first-class-violations.md
---

# Response: first-class violations landed

## Files changed (6)

1. **`peb-domain/entity/PebTransaction.java`** — added 3 read-only accessors the
   violation ingestion needs:
   ```java
   public UUID getId()               { return id; }
   public String getEntityId()       { return entityId; }
   public JsonNode getInput()        { return input; }
   ```

2. **`peb-domain/entity/PebViolation.java`** — replaced the placeholder comment
   `// Getters and Setters omitted for brevity` with full bean-style getters/setters
   for every field (id, transactionId, violationType, severity, entityId,
   capabilityAttempted, context, resolution, createdAt). Required so Java code
   can populate the entity.

3. **NEW: `peb-core/violation/PebViolationEngine.java`** — single `@Transactional`
   service:
   - Reads `req.getInput()` (JsonNode).
   - Requires `violation_type` and `severity` to be present and textual.
   - Validates their values via `ViolationType.valueOf` / `ViolationSeverity.valueOf`
     — throws `IllegalArgumentException` on missing/unknown.
   - Builds `PebViolation` with `id = UUID.randomUUID()`,
     `transactionId = req.getId()`, `entityId = req.getEntityId()`,
     `context = req.getInput()` (full JsonNode snapshot),
     `resolution = REJECTED`, `createdAt = Instant.now()`.
   - Calls `repository.save(v)`.

4. **`peb-core/engine/PebGovernanceEngine.java`** — added `PebViolationEngine`
   dependency. Inside `processForPath`, the violation branch now calls
   `violationEngine.ingest(tx)` after `commitTransaction(tx)`:
   ```java
   if (bypassValidator) {
       violationEngine.ingest(tx);   // throws IllegalArgumentException on malformed
       return "Violation recorded as REJECTED";
   }
   ```
   The audit row is still written first; the first-class violation row follows
   in its own `@Transactional`.

5. **`peb-api/controller/AdmissionControllerFacade.java`** — added one method:
   ```java
   @ExceptionHandler(IllegalArgumentException.class)
   public ResponseEntity<String> handleIllegalArgument(IllegalArgumentException ex) {
       return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                            .body("Malformed admission request: " + ex.getMessage());
   }
   ```
   Translates malformed-domain-input (currently only from `PebViolationEngine`)
   to HTTP 422 with the engine's diagnostic message.

## Validation

### Typecheck
```
mvn clean install -B -ntp   # exit 0; all 9 modules SUCCESS; ~5s
```

### Smoke test (against running kernel, Postgres `nexus` DB)

| request                                                          | HTTP | audit row (`peb_transactions`) | first-class row (`peb_violations`) |
|------------------------------------------------------------------|------|----------|----------|
| valid `peb_report_violation` with `violation_type=AUTHORITY_LEAKAGE`, `severity=HARD`, `capability_attempted=write_unauthorized_state` | **200** | ✓ | ✓ |
| malformed: missing `violation_type`, only `severity=SOFT`        | **422** | ✓ (audit-only, no violation row) | ✗ |
| malformed: `violation_type=NOT_A_REAL_TYPE`, `severity=HARD`     | **422** | ✓ (audit-only, no violation row) | ✗ |

Post-state in DB:
```
audit_rows = 3 (1 valid + 2 malformed)
violation_rows = 1 (valid only)
```

Both tables now contain the data each is supposed to contain: the
audit row preserves "who tried what" even for malformed calls; the
violation table contains only the structured, well-formed violations.

## Critiques now resolved

| code-reviewer critique (from prior turn)                                                  | status |
|-------------------------------------------------------------------------------------------|--------|
| 1. denial path loses audit trail (validator rejection → no `peb_transactions` row)        | resolved in prior turn — denial now writes audit row with `admission_result=REJECTED` |
| 2. `REPORT_VIOLATION` doesn't write a `peb_violations` row                                  | **resolved this turn** |
| 3. HTTP 200 for admission denial                                                          | partially resolved this turn — denial-by-validator still 200 with text body, but malformed-domain now 422. The remaining "200 vs 422 for validator denial" point is tracked as a followup. |

## Critiques still open (logged as followups)

| critique                                                                                   | impact | disposition |
|--------------------------------------------------------------------------------------------|--------|-------------|
| Two-write inconsistency (audit + violation in separate `@Transactional`)                   | low — `IllegalArgumentException` paths leave audit-only orphan rows that are still readable. Real DB-level hygiene would put both writes in one tx. | followup: combine into one tx |
| `@ExceptionHandler(IllegalArgumentException.class)` is broad                                | low — currently only `PebViolationEngine` raises IAE for domain reasons; future IAE throws for programmer bugs would be silently masked as 422. | followup: introduce `MalformedAdmissionRequestException` |
| No `peb_violations` idempotency on retry (each retry → new `id`)                           | low — caller can correlate by `transaction_id`, which is unaffected | followup: add unique constraint on `transaction_id` if dupes are unwanted |
| No unit tests added                                                                        | medium | followup: `@DataJpaTest` for `PebViolationEngine.ingest` |
| HTTP 200 vs 422 for validator-failed `VALIDATE` / `MUTATE` calls                           | low — debatable; some users prefer 422 | followup: confirm with user |
