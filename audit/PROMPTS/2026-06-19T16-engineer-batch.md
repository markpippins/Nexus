# Engineer Batch: PrePersist + JavaDoc + WebMvcTest

**PromptRef:** N/A (direct request)
**Session:** 2026-06-19 engineer session
**Date:** 2026-06-19

## Prompt

Three tasks:

1. Add `@PrePersist onCreate()` null-fill on `PebViolation.createdAt` (mirroring the `PebTransaction` fix) and drop the manual `setCreatedAt(Instant.now())` from `PebViolationEngine.ingest`.
2. Refresh `PebTransactionEngine.beginTransaction` / `commitTransaction` JavaDoc to clarify `REQUIRED` propagation and note historical naming.
3. Add a `@SpringBootTest + @AutoConfigureMockMvc` for the typed `@ExceptionHandler(MalformedAdmissionRequestException)` → 422 mapping on `AdmissionControllerFacade`.

## Files Changed

- `peb-domain/.../PebViolation.java` — @PrePersist callback
- `peb-core/.../PebViolationEngine.java` — removed manual set + unused import
- `peb-core/.../PebTransactionEngine.java` — JavaDoc refresh
- `peb-api/.../AdmissionControllerFacadeTest.java` → moved/deleted
- `peb-bootstrap/.../AdmissionControllerFacadeTest.java` — new test
- `peb-api/pom.xml` — reverted test dep
- `peb-bootstrap/pom.xml` — added spring-boot-starter-test, H2, surefire Byte Buddy experimental flag
