---
project: nexus
date: 2026-06-19
in_response_to: 2026-06-19T07-tool-dispatch
---

## PEB Kernel — toolName dispatch implemented, three-path smoke test passes

`AdmissionControllerFacade` now routes each of the 9 MCP tool names to one of four admission paths. The smoke test exercised three of them under JDK 21 against the same Postgres setup as the prior turn, and the kernel records the right `admission_result` per path:

| Posted `toolName`            | Routed to                | `peb_transactions.admission_result` |
|------------------------------|--------------------------|--------------------------------------|
| `peb_validate_transition`    | `AdmissionPath.VALIDATE` | `ALLOWED`                            |
| `peb_record_decision`        | `AdmissionPath.MUTATE`   | `ALLOWED`                            |
| `peb_report_violation`       | `AdmissionPath.REPORT_VIOLATION` | `REJECTED`                    |

Plus the third path's bypass semantics: `REPORT_VIOLATION` short-circuits the invariant validator (a violation by definition would not pass invariants) and persists `REJECTED`. A separate path would be `UNKNOWN` for any unrecognized tool name (keeps the audit row but marks it `ROUTED` so downstream consumers can tell it apart from a vanilla mutation).

### What changed (4 file edits)

1. **NEW —** `nexus/jvm/spring/peb-kernel/peb-domain/src/main/java/org/nexus/peb/domain/enums/AdmissionPath.java`
   Four-value enum (`VALIDATE`, `MUTATE`, `REPORT_VIOLATION`, `UNKNOWN`) plus `fromToolName(String)` that classifies the 9 MCP tools and `defaultAdmissionResult()` that returns the matching `AdmissionResult` (ALLOWED / ALLOWED / REJECTED / ROUTED). Lives in `peb-domain` so both `peb-core` (engine) and `peb-api` (controller) can see it — putting it in `peb-api` would have inverted the existing Maven dependency direction.

2. **EDITED —** `nexus/jvm/spring/peb-kernel/peb-domain/src/main/java/org/nexus/peb/domain/entity/PebTransaction.java`
   Added three minimal accessors to the otherwise "Getters and Setters omitted for brevity" entity: `getToolName()`, `getAdmissionResult()`, `setAdmissionResult(AdmissionResult)`. These are the only accessors the dispatch needs; the rest of the entity stays narrow.

3. **REWRITTEN —** `nexus/jvm/spring/peb-kernel/peb-api/src/main/java/org/nexus/peb/api/controller/AdmissionControllerFacade.java`
   The single existing `@PostMapping("/transaction")` now does:

   ```java
   AdmissionPath path = AdmissionPath.fromToolName(transaction.getToolName());
   String result = governanceEngine.processForPath(transaction, path);
   return ResponseEntity.ok(result);
   ```

4. **REWRITTEN —** `nexus/jvm/spring/peb-kernel/peb-core/src/main/java/org/nexus/peb/core/engine/PebGovernanceEngine.java`
   Kept the original `process(PebTransaction)` for back-compat with anything outside the MCP facade and added a new `processForPath(PebTransaction, AdmissionPath)`. The new method:
   - Always persists an audit row (closes the "denial leaves no trace" gap flagged in review).
   - Sets `admissionResult = REJECTED` for `REPORT_VIOLATION` and for any validator denial; otherwise uses `path.defaultAdmissionResult()`.
   - Skips `validator.validate(...)` for `REPORT_VIOLATION` via Java's short-circuit `||`.
   - Returns a path-specific string for observability (`"Validation processed"`, `"Mutation processed"`, `"Violation recorded as REJECTED"`, `"Routed (unknown tool)"`, or `"Admission denied by invariant validator"`).

### How to reproduce

```bash
cd /home/codex/dev/nexus/jvm/spring/peb-kernel
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 \
PATH=/usr/lib/jvm/java-21-openjdk-amd64/bin:$PATH \
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/nexus \
SPRING_DATASOURCE_USERNAME=pguser \
SPRING_DATASOURCE_PASSWORD=pgpass \
mvn spring-boot:run -pl peb-bootstrap -Dspring-boot.run.fork=false   # after one `mvn clean install`

# in another shell, post three distinct tool names:
for T in peb_validate_transition peb_record_decision peb_report_violation; do
  curl -X POST http://localhost:8080/api/v1/peb/transaction \
    -H 'Content-Type: application/json' \
    -d "{\"id\":\"$(uuidgen)\",\"idempotencyKey\":\"k-$T\",\"entityId\":\"e\",\"admissionResult\":\"ALLOWED\",\"toolName\":\"$T\",\"input\":{},\"createdAt\":\"2026-06-19T05:50:00Z\"}"
done

# then verify:
docker exec pgvector_db psql -U pguser -d nexus \
  -c "SELECT tool_name, admission_result FROM peb_transactions WHERE idempotency_key LIKE 'k-%' ORDER BY tool_name;"
```

### Known caveats / followups

- `REPORT_VIOLATION` writes only to `peb_transactions`; it does NOT also write a `PebViolation` entity row. The MCP facade supplies `violation_type`, `severity`, `capability_attempted`, and `context` — all of which map cleanly to `PebViolation`. Wiring that is a scope-expansion (needs a `PebViolationService` + repository) and was deliberately left out; the audit row at least records that the violation occurred.
- HTTP 200 for admission denial is debatable convention; some teams would prefer 422 Unprocessable Entity. Easy followup to switch `ResponseEntity.ok(...)` → `ResponseEntity.status(422).body(...)` for the denial string. Not changed in this turn because it crosses an API contract.
- `InvariantValidator.validate(...)` is still a stub returning `true`. The bypass for `REPORT_VIOLATION` is therefore observably a no-op today; once a real validator is hooked in, the bypass becomes the substantive code path.
- `PebTransaction.committed_at` stayed null. The reviewer's flag explicitly suggested setting it on persistence; deferred because the existing stub engine pattern doesn't set it anywhere and a global setters change felt out of scope.
- The `default:` arm in the trailing switch in `processForPath` is unreachable (`if (bypassValidator) return ...;` catches `REPORT_VIOLATION` before the switch is reached); kept as defensive code for future enum value additions.
- The other MCP tools (`peb_check_invariants`, `peb_validate_transform`, `peb_append_trace_segment`, `peb_request_clarification`, `peb_extension_proposal`) are wired in `AdmissionPath.fromToolName` but were not exercised in this smoke test. They should produce the same dispatch routes as their category peers on smoke; recommend running one of each as a followup before considering the dispatcher fully battle-tested.

### Audit status

- All-disk changes compiled via `mvn clean install`: BUILD SUCCESS for `peb-kernel`, `peb-domain`, `peb-store`, `peb-hash`, `peb-core`, `peb-api`, `peb-adapters`, `peb-observability`, `peb-bootstrap`, `peb-test`.
- Code-reviewer-minimax-m3 returned verdict on the initial patch with three flagged critiques (`denial leaves no audit row`, `REPORT_VIOLATION doesn't write PebViolation`, `HTTP 200 for denial is debatable`); the first critique was applied in this same PR (audit-trail persistence), the latter two are listed as known caveats above.
- Kernel-runs-three-categories smoke test verified the dispatch end-to-end against Postgres.
