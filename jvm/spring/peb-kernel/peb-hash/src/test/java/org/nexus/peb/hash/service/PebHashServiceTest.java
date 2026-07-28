package org.nexus.peb.hash.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.nexus.peb.domain.entity.PebDecision;
import org.nexus.peb.domain.entity.PebState;
import org.nexus.peb.domain.vo.PebStateHash;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for {@link PebHashService} covering all four paths per the
 * Tester role mandate.
 *
 * <h3>Coverage model</h3>
 * <ol>
 *   <li><b>Green path</b> — valid inputs produce deterministic, input-dependent hashes.</li>
 *   <li><b>Orange path</b> — null/empty inputs are handled gracefully.</li>
 *   <li><b>Red path</b> — adversarial data (large lists, null keys/checksums).</li>
 *   <li><b>Silent failure</b> — regression lock proving the hash actually
 *       varies with input (previously the stub returned a constant).</li>
 * </ol>
 */
@DisplayName("PebHashService")
class PebHashServiceTest {

    private PebHashService hashService;

    @BeforeEach
    void setUp() {
        hashService = new PebHashService();
    }

    // ─────────────────────────────────────────────────────────────
    // GREEN PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Green path — valid inputs produce hashes")
    class GreenPath {

        @Test
        @DisplayName("non-null hash returned for valid input")
        void validInput_returnsNonNull() {
            PebStateHash result = hashService.computeSystemHash(
                List.of(), null);
            assertNotNull(result, "Hash should not be null for valid input");
        }

        @Test
        @DisplayName("hash has expected format (64-char hex)")
        void hashHasExpectedFormat() {
            PebStateHash result = hashService.computeSystemHash(
                List.of(), null);
            assertTrue(result.value().matches("^[a-f0-9]{64}$"),
                "Hash should be a 64-char hex string, got: " + result.value());
        }

        @Test
        @DisplayName("prefixed() returns sha256: prefix")
        void prefixedReturnsSha256Prefix() {
            PebStateHash result = hashService.computeSystemHash(
                List.of(), null);
            assertTrue(result.prefixed().startsWith("sha256:"),
                "prefixed() should return 'sha256:' prefix");
        }

        @Test
        @DisplayName("null decision with empty state list is accepted")
        void nullDecision_emptyStates_accepted() {
            PebStateHash result = hashService.computeSystemHash(
                Collections.emptyList(), null);
            assertNotNull(result, "Should accept null decision with empty states");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // ORANGE PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Orange path — edge cases")
    class OrangePath {

        @Test
        @DisplayName("null state list is handled gracefully")
        void nullStateList_handled() {
            assertDoesNotThrow(() ->
                hashService.computeSystemHash(null, null),
                "Should handle null state list without throwing");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RED PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Red path — adversarial input")
    class RedPath {

        @Test
        @DisplayName("very large state list does not OOM")
        void veryLargeStateList_doesNotOom() {
            List<PebState> largeList = Collections.nCopies(10_000,
                new PebState() { /* minimal mock */ });
            assertDoesNotThrow(() ->
                hashService.computeSystemHash(largeList, null),
                "Should handle large state list without OOM");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // SILENT FAILURE — regression + metamorphic
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Silent failure — regression lock and metamorphic tests")
    class SilentFailure {

        /**
         * Regression lock: The previous implementation was a stub that
         * returned SHA-256("placeholder-hash-logic") for all inputs.
         * This test locks in that the hash is NO LONGER that constant —
         * it must vary with actual input.
         */
        @Test
        @DisplayName("REGRESSION LOCK: hash is not the old stub constant")
        void regressionLock_hashIsNotStubConstant() {
            List<PebState> states = List.of(
                createState("invariants", "abc123checksum1"),
                createState("architecture", "def456checksum2"));

            PebStateHash hash = hashService.computeSystemHash(states, null);
            String stubConstant = "9d33ffa0f408f6586d4e34c8c52519ff2af30890138d1d6b36a5abc0f3d0b84b";

            assertNotEquals(stubConstant, hash.value(),
                "Hash must NOT be the old stub constant — it must vary with input");
        }

        /**
         * Metamorphic: Different checksums for the same key must produce
         * different system hashes. If they don't, the hash function is
         * not using the checksum input.
         */
        @Test
        @DisplayName("METAMORPHIC: different checksums produce different hashes")
        void metamorphic_differentChecksums_differentHashes() {
            List<PebState> states1 = List.of(
                createState("invariants", "aaaa1111"));
            List<PebState> states2 = List.of(
                createState("invariants", "bbbb2222"));

            PebStateHash hash1 = hashService.computeSystemHash(states1, null);
            PebStateHash hash2 = hashService.computeSystemHash(states2, null);

            assertNotEquals(hash1.value(), hash2.value(),
                "Different checksums for same key MUST produce different hashes");
        }

        /**
         * Metamorphic: Different keys must produce different hashes
         * even with the same checksum, because the key is part of the
         * leaf hash input.
         */
        @Test
        @DisplayName("METAMORPHIC: different keys produce different hashes")
        void metamorphic_differentKeys_differentHashes() {
            List<PebState> states1 = List.of(
                createState("invariants", "samechecksum"));
            List<PebState> states2 = List.of(
                createState("architecture", "samechecksum"));

            PebStateHash hash1 = hashService.computeSystemHash(states1, null);
            PebStateHash hash2 = hashService.computeSystemHash(states2, null);

            assertNotEquals(hash1.value(), hash2.value(),
                "Different keys with same checksum MUST produce different hashes");
        }

        /**
         * Determinism: Same inputs must produce identical hashes.
         */
        @Test
        @DisplayName("DETERMINISM: same inputs produce same hash")
        void determinism_sameInputsSameHash() {
            List<PebState> states = List.of(
                createState("invariants", "checksum1"),
                createState("trajectory", "checksum2"));

            PebStateHash hash1 = hashService.computeSystemHash(states, null);
            PebStateHash hash2 = hashService.computeSystemHash(states, null);

            assertEquals(hash1.value(), hash2.value(),
                "Identical inputs MUST produce identical hashes");
        }

        /**
         * Decision afterHash is folded into the final root.
         */
        @Test
        @DisplayName("decision afterHash changes the system hash")
        void decisionAfterHash_changesSystemHash() {
            List<PebState> states = List.of(
                createState("invariants", "checksum1"));

            PebDecision dec1 = new PebDecision();
            dec1.setAfterHash(PebStateHash.compute("decisionA").value());

            PebDecision dec2 = new PebDecision();
            dec2.setAfterHash(PebStateHash.compute("decisionB").value());

            PebStateHash hash1 = hashService.computeSystemHash(states, dec1);
            PebStateHash hash2 = hashService.computeSystemHash(states, dec2);

            assertNotEquals(hash1.value(), hash2.value(),
                "Different decision afterHashes MUST produce different system hashes");
        }

        /**
         * Adding a state changes the hash — the hash actually reflects
         * the state set, not just a constant.
         */
        @Test
        @DisplayName("METAMORPHIC: adding a state changes the hash")
        void metamorphic_addingState_changesHash() {
            List<PebState> states1 = List.of(
                createState("invariants", "checksum1"));
            List<PebState> states2 = List.of(
                createState("invariants", "checksum1"),
                createState("architecture", "checksum2"));

            PebStateHash hash1 = hashService.computeSystemHash(states1, null);
            PebStateHash hash2 = hashService.computeSystemHash(states2, null);

            assertNotEquals(hash1.value(), hash2.value(),
                "Adding a state MUST change the system hash");
        }

        /**
         * Null key in a state is handled gracefully (treated as empty string).
         */
        @Test
        @DisplayName("null state key does not throw")
        void nullStateKey_doesNotThrow() {
            PebState s = new PebState();
            s.setId(UUID.randomUUID());
            s.setKey(null);
            s.setChecksum("checksum1");

            assertDoesNotThrow(() ->
                hashService.computeSystemHash(List.of(s), null),
                "Null state key should not throw");
        }

        /**
         * Order independence: The same set of states in any order must
         * produce the same hash (keys are sorted before hashing).
         */
        @Test
        @DisplayName("DETERMINISM: state order does not affect hash")
        void orderIndependence_sameStatesAnyOrder() {
            List<PebState> order1 = List.of(
                createState("invariants", "c1"),
                createState("architecture", "c2"),
                createState("trajectory", "c3"));
            List<PebState> order2 = List.of(
                createState("trajectory", "c3"),
                createState("invariants", "c1"),
                createState("architecture", "c2"));

            PebStateHash hash1 = hashService.computeSystemHash(order1, null);
            PebStateHash hash2 = hashService.computeSystemHash(order2, null);

            assertEquals(hash1.value(), hash2.value(),
                "Same states in different order MUST produce same hash (sorted by key)");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    private PebState createState(String key, String checksum) {
        PebState s = new PebState();
        s.setId(UUID.randomUUID());
        s.setKey(key);
        s.setChecksum(checksum);
        s.setCreatedAt(Instant.now());
        s.setUpdatedAt(Instant.now());
        return s;
    }
}
