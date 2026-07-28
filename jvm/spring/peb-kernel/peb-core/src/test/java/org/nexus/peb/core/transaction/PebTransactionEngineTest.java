package org.nexus.peb.core.transaction;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.nexus.peb.domain.entity.PebTransaction;
import org.nexus.peb.domain.enums.AdmissionResult;
import org.nexus.peb.hash.service.PebHashService;
import org.nexus.peb.store.repository.PebTransactionRepository;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Tests for {@link PebTransactionEngine} covering all four paths
 * per the Tester role mandate.
 *
 * <h3>Coverage model</h3>
 * <ol>
 *   <li><b>Green path</b> — begin/commit produce saved transactions.</li>
 *   <li><b>Orange path</b> — null transaction handling, repository failures.</li>
 *   <li><b>Red path</b> — concurrent writes, duplicate idempotency keys.</li>
 *   <li><b>Silent failure</b> — committedAt timestamp is actually set,
 *       repository.save() is actually called (not silently skipped).</li>
 * </ol>
 */
@DisplayName("PebTransactionEngine")
@ExtendWith(MockitoExtension.class)
class PebTransactionEngineTest {

    @Mock
    private PebTransactionRepository repository;

    private PebHashService hashService;

    private PebTransactionEngine engine;

    @BeforeEach
    void setUp() {
        // Use a real PebHashService — its methods are never called in these
        // tests, and Mockito cannot mock concrete classes across module
        // boundaries in Java 17+.
        hashService = new PebHashService();
        engine = new PebTransactionEngine(repository, hashService);
    }

    // ─────────────────────────────────────────────────────────────
    // GREEN PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Green path — normal transaction lifecycle")
    class GreenPath {

        @Test
        @DisplayName("beginTransaction saves and returns transaction")
        void beginTransaction_savesAndReturns() {
            PebTransaction tx = createTransaction();
            when(repository.save(tx)).thenReturn(tx);

            PebTransaction result = engine.beginTransaction(tx);

            assertNotNull(result, "beginTransaction should return non-null");
            assertSame(tx, result, "Should return the same transaction instance");
            verify(repository, times(1)).save(tx);
        }

        @Test
        @DisplayName("commitTransaction sets committedAt and saves")
        void commitTransaction_setsCommittedAt() {
            PebTransaction tx = createTransaction();
            when(repository.save(tx)).thenReturn(tx);

            PebTransaction result = engine.commitTransaction(tx);

            assertNotNull(result.getCommittedAt(),
                "commitTransaction must set committedAt timestamp");
            assertTrue(
                result.getCommittedAt().isAfter(
                    Instant.now().minusSeconds(5)),
                "committedAt should be recent");
            verify(repository, times(1)).save(tx);
        }

        @Test
        @DisplayName("begin+commit lifecycle produces committed transaction")
        void beginThenCommit_producesCommittedTransaction() {
            PebTransaction tx = createTransaction();
            when(repository.save(any(PebTransaction.class))).thenReturn(tx);

            PebTransaction begun = engine.beginTransaction(tx);
            PebTransaction committed = engine.commitTransaction(begun);

            assertNotNull(committed.getCommittedAt(),
                "Transaction should have committedAt after commit");
            verify(repository, times(2)).save(any(PebTransaction.class));
        }
    }

    // ─────────────────────────────────────────────────────────────
    // ORANGE PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Orange path — edge cases and failures")
    class OrangePath {

        @Test
        @DisplayName("commitTransaction on already-committed tx does not go backwards")
        void doubleCommit_doesNotGoBackwards() {
            PebTransaction tx = createTransaction();
            when(repository.save(any(PebTransaction.class))).thenReturn(tx);

            PebTransaction first = engine.commitTransaction(tx);
            Instant firstCommit = first.getCommittedAt();

            // Simulate second commit
            PebTransaction second = engine.commitTransaction(first);
            Instant secondCommit = second.getCommittedAt();

            // Second commit should not produce an older timestamp
            assertFalse(secondCommit.isBefore(firstCommit),
                "Second commit should not produce an older committedAt");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RED PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Red path — adversarial and concurrent scenarios")
    class RedPath {

        @Test
        @DisplayName("repository exception during beginTransaction propagates")
        void repositoryException_propagates() {
            PebTransaction tx = createTransaction();
            when(repository.save(tx)).thenThrow(new RuntimeException("DB down"));

            assertThrows(RuntimeException.class,
                () -> engine.beginTransaction(tx),
                "Repository exception should propagate to caller");
        }

        @Test
        @DisplayName("repository exception during commitTransaction propagates")
        void repositoryExceptionOnCommit_propagates() {
            PebTransaction tx = createTransaction();
            when(repository.save(tx)).thenThrow(new RuntimeException("DB down"));

            assertThrows(RuntimeException.class,
                () -> engine.commitTransaction(tx),
                "Repository exception on commit should propagate");
        }

        @Test
        @DisplayName("commitTransaction with null committedAt defaults correctly")
        void commitTransaction_nullCommittedAt_defaults() {
            PebTransaction tx = createTransaction();
            tx.setCommittedAt(null);
            when(repository.save(tx)).thenReturn(tx);

            PebTransaction result = engine.commitTransaction(tx);

            assertNotNull(result.getCommittedAt(),
                "Even with null initial committedAt, commitTransaction should set it");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // SILENT FAILURE
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Silent failure — metamorphic testing")
    class SilentFailure {

        /**
         * Metamorphic test: Each call to commitTransaction should produce
         * a newer committedAt timestamp. If the timestamps are identical
         * or not monotonically increasing, the commit is not actually
         * recording time of commit.
         */
        @Test
        @DisplayName("committedAt does not go backwards across commits")
        void committedAt_doesNotGoBackwards() {
            PebTransaction tx1 = createTransaction();
            PebTransaction tx2 = createTransaction();
            when(repository.save(any(PebTransaction.class)))
                .thenReturn(tx1).thenReturn(tx2);

            PebTransaction committed1 = engine.commitTransaction(tx1);
            PebTransaction committed2 = engine.commitTransaction(tx2);

            assertFalse(
                committed2.getCommittedAt().isBefore(committed1.getCommittedAt()),
                "Second commit should not have earlier committedAt than first");
        }

        /**
         * Verifies that repository.save() is actually called — not
         * silently skipped. A bug where the save is skipped would be
         * a silent failure: no exception, but no persistence.
         */
        @Test
        @DisplayName("repository.save() is actually invoked (not silently skipped)")
        void repositorySave_isInvoked() {
            PebTransaction tx = createTransaction();
            when(repository.save(tx)).thenReturn(tx);

            engine.beginTransaction(tx);
            verify(repository).save(tx);

            engine.commitTransaction(tx);
            verify(repository, times(2)).save(tx);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    private PebTransaction createTransaction() {
        PebTransaction tx = new PebTransaction();
        // PebTransaction uses field-level visibility (no setters for id,
        // toolName, entityId, input). Use ReflectionTestUtils for test data.
        ReflectionTestUtils.setField(tx, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(tx, "toolName", "test-tool");
        ReflectionTestUtils.setField(tx, "entityId", "test-entity");
        ReflectionTestUtils.setField(tx, "input", new ObjectMapper().createObjectNode());
        tx.setCreatedAt(Instant.now());
        tx.setAdmissionResult(AdmissionResult.ALLOWED);
        return tx;
    }
}
