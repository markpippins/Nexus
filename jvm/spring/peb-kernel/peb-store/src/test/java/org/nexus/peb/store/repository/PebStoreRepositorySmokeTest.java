package org.nexus.peb.store.repository;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Structural verification that all 6 PEB repositories exist and declare
 * the expected custom query methods.
 *
 * <p>Full CRUD testing requires @DataJpaTest with a real PostgreSQL
 * (entities use jsonb columns that H2 cannot emulate). This test
 * verifies the repository interface contracts compile and expose the
 * expected custom query signatures.
 */
@DisplayName("PebStore Repositories — Structural Verification")
class PebStoreRepositorySmokeTest {

    // ── PebStateRepository ──────────────────────────────────────

    @Nested
    @DisplayName("PebStateRepository")
    class PebStateRepositoryTests {

        @Test
        @DisplayName("declares findByKey(String) returning Optional<PebState>")
        void declares_findByKey() throws NoSuchMethodException {
            Method m = PebStateRepository.class.getMethod("findByKey", String.class);
            assertEquals(Optional.class, m.getReturnType());
        }

        @Test
        @DisplayName("extends JpaRepository<PebState, UUID>")
        void extends_JpaRepository() {
            assertTrue(org.springframework.data.jpa.repository.JpaRepository.class
                    .isAssignableFrom(PebStateRepository.class));
        }
    }

    // ── PebTransactionRepository ────────────────────────────────

    @Nested
    @DisplayName("PebTransactionRepository")
    class PebTransactionRepositoryTests {

        @Test
        @DisplayName("declares findByIdempotencyKey(String) returning Optional<PebTransaction>")
        void declares_findByIdempotencyKey() throws NoSuchMethodException {
            Method m = PebTransactionRepository.class
                    .getMethod("findByIdempotencyKey", String.class);
            assertEquals(Optional.class, m.getReturnType());
        }

        @Test
        @DisplayName("extends JpaRepository<PebTransaction, UUID>")
        void extends_JpaRepository() {
            assertTrue(org.springframework.data.jpa.repository.JpaRepository.class
                    .isAssignableFrom(PebTransactionRepository.class));
        }
    }

    // ── All other repos ─────────────────────────────────────────

    @Nested
    @DisplayName("All 6 repositories")
    class AllRepositories {

        @Test
        @DisplayName("PebCapabilityRepository extends JpaRepository")
        void pebCapabilityRepository() {
            assertTrue(org.springframework.data.jpa.repository.JpaRepository.class
                    .isAssignableFrom(PebCapabilityRepository.class));
        }

        @Test
        @DisplayName("PebDecisionRepository extends JpaRepository")
        void pebDecisionRepository() {
            assertTrue(org.springframework.data.jpa.repository.JpaRepository.class
                    .isAssignableFrom(PebDecisionRepository.class));
        }

        @Test
        @DisplayName("PebTraceRepository extends JpaRepository")
        void pebTraceRepository() {
            assertTrue(org.springframework.data.jpa.repository.JpaRepository.class
                    .isAssignableFrom(PebTraceRepository.class));
        }

        @Test
        @DisplayName("PebViolationRepository extends JpaRepository")
        void pebViolationRepository() {
            assertTrue(org.springframework.data.jpa.repository.JpaRepository.class
                    .isAssignableFrom(PebViolationRepository.class));
        }

        @Test
        @DisplayName("all 6 repos have @Repository annotation")
        void all_have_RepositoryAnnotation() {
            Class<?>[] repos = {
                    PebCapabilityRepository.class,
                    PebDecisionRepository.class,
                    PebStateRepository.class,
                    PebTraceRepository.class,
                    PebTransactionRepository.class,
                    PebViolationRepository.class
            };
            for (Class<?> repo : repos) {
                assertNotNull(repo.getAnnotation(org.springframework.stereotype.Repository.class),
                        repo.getSimpleName() + " should have @Repository");
            }
        }
    }
}
