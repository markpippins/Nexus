---
project: nexus
date: 2026-06-19
in_response_to: 2026-06-19T05-peb-kernel-maven-build
---

## PEB Kernel — Maven Build Going

`mvn clean install` now succeeds end-to-end. Two coordinated fixes applied.

### Module status (BUILD SUCCESS, all 10)

| # | Module | Result |
|---|---|---|
| 1 | peb-kernel (root) | SUCCESS |
| 2 | peb-domain | SUCCESS (14 .java) |
| 3 | peb-store | SUCCESS (6 .java + V1 Flyway migration) |
| 4 | peb-hash | SUCCESS (1 .java) |
| 5 | peb-core | SUCCESS (3 .java) |
| 6 | peb-api | SUCCESS (1 .java — fixed) |
| 7 | peb-adapters | SUCCESS (2 .java) |
| 8 | peb-observability | SUCCESS (no .java, just pom) |
| 9 | peb-bootstrap | SUCCESS (1 .java — fixed) |
| 10 | peb-test | SUCCESS |

Build time: ~40 s on the second run. No warnings beyond normal Guava `sun.misc.Unsafe` notices from JDK 25 against Spring Boot 3.4.0 (functional, ignorable).

### Fix 1 — `peb-api/src/main/java/org/nexus/peb/api/controller/AdmissionControllerFacade.java`

Two wrong Spring import paths. `org.springframework.web.bind.{RequestMapping,RestController}` do not exist; the correct package is `org.springframework.web.bind.annotation.{...}`. The other two annotations in the same file (`PostMapping`, `RequestBody`) already used the `.annotation` package — this fix brings the broken two in line with that convention. 2 lines changed.

### Fix 2 — `peb-bootstrap/pom.xml`

Added `spring-boot-starter-data-jpa` as **compile-scope** dependency (kept `peb-store` at runtime scope).

**Why:** `PebApplication.java` uses `@EnableJpaRepositories`. That class lives in `spring-data-jpa`. The `peb-store` module pulls JPA in too, but only at runtime scope, so the symbol wasn't on the bootstrap compile classpath at the point the build failed. A 4-line comment was added to the pom explaining the compile-scope choice so the layering decision is preserved in source (store stays runtime-only as the original author intended).

### Environment notes (FYI, no edit)

- **JDK active:** OpenJDK 25.0.3 (system default). `JAVA_HOME` is unset. JDK 21 is available at `/usr/lib/jvm/java-21-openjdk-amd64` and matches `pom.xml`'s `<java.version>21</java.version>`. Build succeeded on JDK 25, but `JAVA_HOME` could be set if cleaner output is wanted.
- **Network:** `repo.maven.apache.org` now resolves via Cloudflare (HTTP 200 in ~0.7 s). The previous "Unknown host" failure on the 2026-06-18 build attempt was a transient DNS outage and is currently resolved.
- **Files NOT touched** (would be a separate decision): `peb-test` (no source yet — pom only), `peb-observability` (no source yet — pom only), `peb-bootstrap/src/main/resources/application.yml` (still points at `localhost:5432/peb` with default creds — fine for the build, runtime would need a real DB).

### Open notes

- Team code-review (via `code-reviewer-minimax-m3`) for both fixes was attempted but `spawn_agents` returned transient unavailability twice. Worth re-requesting when the tool is back up, particularly to validate the **Option A vs. Option C** trade-off on Fix 2 (i.e., is `compile-scope` `spring-boot-starter-data-jpa` correct, or should `@EnableJpaRepositories` be removed and rely on Spring Boot autoconfig since `peb-store`'s runtime scope still brings JPA into the runtime classpath? I went with compile-scope because the explicit `@EnableJpaRepositories(basePackages = "org.nexus.peb.store.repository")` is intentional scoping — removing it loses that intent).
