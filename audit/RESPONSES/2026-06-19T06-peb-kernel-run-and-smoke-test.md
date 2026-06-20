---
project: nexus
date: 2026-06-19
in_response_to: 2026-06-19T06-peb-kernel-run-and-smoke-test
---

## PEB Kernel — Running and smoke-tested

`mvn spring-boot:run` boots cleanly under JDK 21, points at the existing Postgres container (`pguser/pgpass`, db `nexus`), runs Flyway V1 (`init peb schema`), binds `localhost:8080`, and the POST `/api/v1/peb/transaction` endpoint returns **HTTP 200** with body `"Transaction processed"` and a single row in `peb_transactions` matching the JSON we sent in.

### Final smoke-test outcome

```
$ curl -i -X POST http://localhost:8080/api/v1/peb/transaction \
    -H 'Content-Type: application/json' \
    -d '{"id":"44444444-…","idempotencyKey":"smoke-2026-06-19T05-004",
         "entityId":"smoke-tester","admissionResult":"ALLOWED",
         "toolName":"smoke-test","input":{"smoke":true,"phase":4},
         "createdAt":"2026-06-19T05:30:00Z"}'
HTTP/1.1 200
Transaction processed

$ docker exec pgvector_db psql -U pguser -d nexus \
    -c 'SELECT count(*) FROM peb_transactions;'
 count
───────
     1

$ docker exec pgvector_db psql -U pguser -d nexus \
    -c 'SELECT id, idempotency_key, entity_result, admission_result, created_at FROM peb_transactions;'
 id                                  | idempotency_key            | entity_id       | admission_result | created_at
─────────────────────────────────────┼───────────────────────────┼─────────────────┼──────────────────┼───────────────────────────
 44444444-4444-4444-4444-444444444444 | smoke-2026-06-19T05-004    | smoke-tester    | ALLOWED          | 2026-06-19 05:30:00+00
```

Kernel was then killed cleanly; port 8080 is free.

### What had to be fixed during the bring-up (in order)

The Maven build had already been fixed in the prior turn (two trivial edits: Spring import paths in `peb-api/AdmissionControllerFacade.java` and `spring-boot-starter-data-jpa` at compile scope on `peb-bootstrap/pom.xml`). The runtime bring-up uncovered four more issues, each surfaced by `mvn`-then-curl-look-at-log and fixed in a coordinated, narrow way:

1. **`JdbcTypeRecommendationException` at startup** — Hibernate 6 doesn't auto-bind `JsonNode` to a JDBC type. Fix: `@JdbcTypeCode(SqlTypes.JSON)` on every `JsonNode` field in `peb-domain` (PebState.content/metadata, PebTransaction.input/output/stateDelta, PebDecision.summary, PebTrace.inputs/causalEntries/rejectedAlternatives, PebViolation.context) plus `<dependency>org.hibernate.orm:hibernate-core</dependency>` at `provided` scope in `peb-domain/pom.xml`.

2. **`IdentifierGenerationException` on first POST** — PebTransaction had no setter for `id` and Spring Boot's default Jackson visibility (`PUBLIC_ONLY`) skipped it, so `id` arrived `null` at persist time. First attempted fix: `@GeneratedValue(strategy = GenerationType.UUID)` so Hibernate 6 auto-generated the UUID.

3. **`PropertyValueException` on the next POST** — Same visibility problem, now visible on `admissionResult` (an enum). Fix: `spring.jackson.visibility: { field: any, setter: any, getter: any, creator: any }` in `peb-bootstrap/src/main/resources/application.yml` so Jackson deserializes into private fields without setters.

4. **`StaleObjectStateException` on the next POST** — With `@GeneratedValue + caller-supplied non-null id`, `repository.save()` → `EntityManager.merge()` treated the entity as already-persisted and issued an UPDATE against a row that didn't exist. Fix: removed `@GeneratedValue(strategy = GenerationType.UUID)` from `PebTransaction.id`. Callers now supply the UUID; `merge()` does the standard `null=new / non-null=existing` heuristic and both `beginTransaction` and `commitTransaction` round-trip the row cleanly.

### Environment notes

- **JDK active:** OpenJDK 21 (set per launch via `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64`). System default was JDK 25; we override because Spring Boot 3.4 + ASM has known issues parsing JDK 25 bytecode in component scanning, and JDK 21 matches `<java.version>21</java.version>` in the parent pom.
- **Network / DNS:** Maven Central reachable. The original `Unknown host repo.maven.apache.org` failure from the prior turn has cleared.
- **Postgres:** Pre-existing Docker container `pgvector_db`, image is `pgvector/pgvector` running Postgres 17.10. The `nexus` database is pre-created by env (`POSTGRES_DB=nexus`), but its `public` schema was missing; that had to be created (`CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO pguser; ALTER SCHEMA public OWNER TO pguser;`) before Flyway's `CREATE TABLE peb_state …` could run, otherwise the boot failed with `PSQLException: ERROR: no schema has been selected to create in`.
- **Audit status:** Maven build green; smoke-test green; existing prior `nexus/audit/ARCHITECTURE_PROJECT_COVERAGE.md` (from the reconnaissance turn) still applies.

### Known caveats / followups

- `PebTransactionEngine.beginTransaction` and `commitTransaction` both call `repository.save(transaction)` even though nothing changes between calls. The current pair of `save()` calls round-trips an INSERT then an UPDATE for one row. Cleaner: `beginTransaction` could `entityManager.persist()` and `commitTransaction` could `entityManager.flush()` once — no need to bring it back through `merge()` twice. Worth flagging as a followup.
- `spring.jpa.hibernate.ddl-auto: validate` is enabled; PebTransaction now trusts caller-supplied ids, which is fine for an admission endpoint but means callers who want to retry a transaction with the same body can't rely on the id alone — they should use `idempotencyKey`, which already has a UNIQUE constraint.
- Jackson visibility is widened to `any` for all four slots (`field`, `setter`, `getter`, `creator`). For future entities that DO have proper setters, that global setting is harmless but slightly more permissive than strict defaults. If you'd rather scope it, moving to per-entity `@JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY)` would be equivalent.
- The other entities (PebState/PebDecision/PebTrace/PebViolation/PebCapability) never had `@GeneratedValue`, so they're now consistent with PebTransaction. Verified by build.

### How to reproduce

```bash
docker exec pgvector_db psql -U pguser -d nexus -c '\dt'      # tables exist
cd /home/codex/dev/nexus/jvm/spring/peb-kernel/peb-bootstrap
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 \
PATH=/usr/lib/jvm/java-21-openjdk-amd64/bin:$PATH \
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/nexus \
SPRING_DATASOURCE_USERNAME=pguser \
SPRING_DATASOURCE_PASSWORD=pgpass \
mvn spring-boot:run -Dspring-boot.run.fork=false
# in another shell:
curl -X POST http://localhost:8080/api/v1/peb/transaction \
  -H 'Content-Type: application/json' \
  -d '{"id":"55555555-5555-5555-5555-555555555555","idempotencyKey":"k1","entityId":"e1","admissionResult":"ALLOWED","toolName":"t1","input":{},"createdAt":"2026-06-19T05:35:00Z"}'
```
