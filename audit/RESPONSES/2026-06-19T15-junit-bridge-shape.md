---
project: nexus
session: peb-kernel-execution-evening
parent_prompt: 2026-06-19T15-junit-bridge-shape.md
---

# Response: ViolationBridgeShapeTest locks the cross-codebase bridge

## Files changed (2)

| path | change |
|------|--------|
| `jvm/spring/peb-kernel/peb-domain/pom.xml` | Added `<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency>`. Spring Boot starter parent manages the version. JavaDoc explains why test scope (rather than compile) and that this enables pure-Java enum parser unit tests without dragging in Spring Boot's full integration-test stack. |
| `jvm/spring/peb-kernel/peb-domain/src/test/java/org/nexus/peb/domain/enums/ViolationBridgeShapeTest.java` (NEW) | JUnit Jupiter test class with six `@Test` methods covering positive and negative mappings: lowercase snake_case inputs to the Java enum; already-uppercase inputs (defending against any future facade tightening); null / blank / unknown rejection; severity (lowercase + uppercase); non-canonical `_violation` suffix → `MalformedAdmissionRequestException` to ensure the asymmetric strip (only `rcl_violation` -> `RCL`) is locked. JavaDoc explains the bug class and how to run (`mvn -pl peb-domain test`). |

## Test infrastructure

Spring Boot starter parent (`spring-boot-starter-parent:3.4.0`) manages
`spring-boot-starter-test` version. `peb-domain` is now test-scope-enabled;
no other module touched.

## Verification

`mvn -pl peb-domain test -B -ntp` in `jvm/spring/peb-kernel` →
```
[INFO] Tests run: 6, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] ------------------------------------------------------------------------
[INFO] Total time: ...
```

All six test methods pass:

- `violation_type_lowercase_snake_case_inputs_map_to_java_enum` — assertEquals on `authority_leakage`, `state_dependency`, `semantic_normalization`, `rcl_violation` (`_VIOLATION` stripped -> `RCL`), `transform_invalid`.
- `violation_type_already_uppercase_inputs_still_match` — assertEquals on `AUTHORITY_LEAKAGE`, `RCL`, `TRANSFORM_INVALID`.
- `severity_lowercase_inputs_map_to_java_enum` — `hard`/`soft`.
- `severity_already_uppercase_inputs_still_match` — `HARD`/`SOFT`.
- `violation_type_rejects_null_blank_and_unknown` — assertThrows on null/`"/whitespace`/`"not_a_real_type"`/`"x_violation"` (the asymmetric `_VIOLATION` carve-out).
- `severity_rejects_null_blank_and_unknown` — assertThrows on null/`""`/whitespace/`"medium"`.

## Critiques now resolved

| critique (from prior reviewer turn) | status |
|----|----|
| The MCP→kernel enum bridge shape was implicit and could regress silently if the regex/normalization changes; no runnable contract existed | **resolved this turn** — `ViolationBridgeShapeTest` is now the contract |

## Critiques still open (logged as followups)

| critique | impact | disposition |
|----|----|----|
| **PebViolation.createdAt** is still filled imperatively in `PebViolationEngine.ingest`, with the same NOT NULL risk for any future call site that bypasses ingest; no parallel `@PrePersist` yet | low — works today | followup: parallel `@PrePersist` on `PebViolation` (mirrors the PebTransaction hardening landed earlier this session) |
| **PebTransactionEngine.beginTransaction / commitTransaction JavaDoc** is now stale since they no longer open separate transactions under the outer `@Transactional` | low | followup: refresh JavaDoc |
| **No `peb_violations` UNIQUE constraint on `transaction_id`** — MCP retries can produce duplicate rows | medium | followup: discuss dedup semantics with the user |
| **No `@DataJpaTest` / `@WebMvcTest`** for the new `@PrePersist` callback or the `@ExceptionHandler(MalformedAdmissionRequestException)` -> 422 mapping | medium | followup |
| **HTTP 200 for validator-denied VALIDATE/MUTATE calls** | low | followup: confirm with user |
