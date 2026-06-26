# Engineer Batch Results

**Build:** `mvn clean install` — BUILD SUCCESS
**Tests:** 8 run, 0 failures, 0 errors
**Duration:** ~130s (Maven cold compile + test)

## Results per Task

### Task 1 — PebViolation @PrePersist createdAt

- `PebViolation.java`: Added `import jakarta.persistence.PrePersist` + `@PrePersist protected void onCreate()` that fills `createdAt` with `Instant.now()` when null (caller-supplied timestamps still win).
- `PebViolationEngine.java`: Removed `v.setCreatedAt(Instant.now())` line + `import java.time.Instant`.
- Mirrors the PebTransaction pattern exactly. Verified: no syntax errors, all modules compile.

### Task 2 — PebTransactionEngine JavaDoc

- `beginTransaction()`: JavaDoc now states "Joins the outer `@Transactional(REQUIRED)` context" — clarifies `REQUIRED` propagation (not REQUIRES_NEW).
- `commitTransaction()`: Same treatment. Both note the historical naming (formerly `beginTransaction` / `commitTransaction` on a dedicated TransactionManager bean; now delegates to `PebTransactionRepository.saveAndFlush` within the caller's existing transaction scope).

### Task 3 — AdmissionControllerFacadeTest @WebMvcTest (SpringBootTest variant)

- Two test methods:
  - `happyPath_isMutationProcessed()` — sends a valid transaction JSON → expects 200 + body `"Mutation processed"`.
  - `malformedRequest_returns422()` — sends `{}` → mocks `processForPath` to throw `MalformedAdmissionRequestException` → expects 422 + JSON `error` field.
- Fixed: datasource URL overridden to `jdbc:h2:mem:testdb` (was using Postgres from `application.yml`).
- Fixed: Flyway disabled, Hibernate `ddl-auto=create-drop`, H2 dialect set.
- Fixed: `net.bytebuddy.experimental=true` in surefire for Java 25 compatibility.
- Moved from `peb-api` (wrong module) → `peb-bootstrap` (where `PebApplication` provides `@SpringBootConfiguration`).
- Switched from `@WebMvcTest` (sibling-package scanning issue) → `@SpringBootTest(classes=PebApplication.class)` + `@AutoConfigureMockMvc`.

## Infrastructure Changes

- `peb-api/pom.xml`: Reverted `spring-boot-starter-test` addition (was never needed).
- `peb-bootstrap/pom.xml`: Added `spring-boot-starter-test` + `com.h2database:h2` (both test scope). Added surefire `<argLine>-Dnet.bytebuddy.experimental=true</argLine>` for Java 25 Byte Buddy compat.
