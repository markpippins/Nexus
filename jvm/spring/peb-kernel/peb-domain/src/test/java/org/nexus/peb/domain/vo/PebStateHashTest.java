package org.nexus.peb.domain.vo;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for {@link PebStateHash} value object covering all four paths
 * per the Tester role mandate.
 *
 * <h3>Coverage model</h3>
 * <ol>
 *   <li><b>Green path</b> — valid 64-char hex strings create valid hashes.</li>
 *   <li><b>Orange path</b> — invalid inputs (null, non-hex, wrong length)
 *       are rejected with clear errors.</li>
 *   <li><b>Red path</b> — boundary and edge cases around the 64-char
 *       constraint.</li>
 *   <li><b>Silent failure</b> — {@code #{@link #metamorphic_differentInputs_shouldProduceDifferentHashes()}}
 *       verifies that {@code compute()} actually varies with its input
 *       (differential testing).</li>
 * </ol>
 */
@DisplayName("PebStateHash")
class PebStateHashTest {

    // ─────────────────────────────────────────────────────────────
    // GREEN PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Green path — valid hashes")
    class GreenPath {

        @Test
        @DisplayName("valid 64-char hex string creates hash")
        void valid64CharHex_createsHash() {
            String hex = "a".repeat(64);
            PebStateHash hash = new PebStateHash(hex);
            assertEquals(hex, hash.value());
        }

        @Test
        @DisplayName("compute() produces valid 64-char hex")
        void compute_producesValidHex() {
            PebStateHash hash = PebStateHash.compute("hello");
            assertNotNull(hash);
            assertEquals(64, hash.value().length());
            assertTrue(hash.value().matches("^[a-f0-9]{64}$"));
        }

        @Test
        @DisplayName("prefixed() returns sha256:value format")
        void prefixed_returnsCorrectFormat() {
            PebStateHash hash = PebStateHash.compute("hello");
            assertEquals("sha256:" + hash.value(), hash.prefixed());
        }

        @Test
        @DisplayName("hash equality works correctly")
        void hashEquality() {
            PebStateHash h1 = new PebStateHash("a".repeat(64));
            PebStateHash h2 = new PebStateHash("a".repeat(64));
            assertEquals(h1, h2, "Same hex values should be equal");
            assertEquals(h1.hashCode(), h2.hashCode(),
                "Equal hashes should have equal hashCodes");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // ORANGE PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Orange path — expected rejection of invalid input")
    class OrangePath {

        @Test
        @DisplayName("null value throws NullPointerException")
        void nullValue_throwsNPE() {
            assertThrows(NullPointerException.class,
                () -> new PebStateHash(null),
                "Null value should throw NullPointerException");
        }

        @Test
        @DisplayName("empty string throws IllegalArgumentException")
        void emptyString_throwsIAE() {
            assertThrows(IllegalArgumentException.class,
                () -> new PebStateHash(""),
                "Empty string should throw IllegalArgumentException");
        }

        @Test
        @DisplayName("non-hex characters throw IllegalArgumentException")
        void nonHexCharacters_throwsIAE() {
            assertThrows(IllegalArgumentException.class,
                () -> new PebStateHash("g".repeat(64)),
                "Non-hex characters should throw IllegalArgumentException");
        }

        @Test
        @DisplayName("wrong length (63 chars) throws IllegalArgumentException")
        void wrongLength63_throwsIAE() {
            assertThrows(IllegalArgumentException.class,
                () -> new PebStateHash("a".repeat(63)),
                "63-char hex should throw IllegalArgumentException");
        }

        @Test
        @DisplayName("wrong length (65 chars) throws IllegalArgumentException")
        void wrongLength65_throwsIAE() {
            assertThrows(IllegalArgumentException.class,
                () -> new PebStateHash("a".repeat(65)),
                "65-char hex should throw IllegalArgumentException");
        }

        @Test
        @DisplayName("uppercase hex is rejected (regex is lowercase-only)")
        void uppercaseHex_rejected() {
            String hex = "A".repeat(64);
            assertThrows(IllegalArgumentException.class,
                () -> new PebStateHash(hex),
                "Uppercase hex should be rejected — regex requires [a-f] lowercase only");
        }

        @Test
        @DisplayName("mixed case hex is rejected")
        void mixedCaseHex_rejected() {
            String hex = "aBcD".repeat(16); // 64 chars, mixed case
            assertThrows(IllegalArgumentException.class,
                () -> new PebStateHash(hex),
                "Mixed-case hex should be rejected — regex requires [a-f] lowercase only");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RED PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Red path — adversarial and boundary input")
    class RedPath {

        @Test
        @DisplayName("whitespace-only value is rejected")
        void whitespaceOnly_rejected() {
            assertThrows(IllegalArgumentException.class,
                () -> new PebStateHash(" ".repeat(64)),
                "Whitespace-only should be rejected");
        }

        @Test
        @DisplayName("value with embedded null byte is rejected")
        void embeddedNullByte_rejected() {
            assertThrows(IllegalArgumentException.class,
                () -> new PebStateHash("a\0".repeat(32)),
                "Embedded null bytes should be rejected");
        }

        @Test
        @DisplayName("extremely long input to compute() produces 64-char output")
        void extremelyLongInput_compute_truncatesTo64() {
            String longInput = "x".repeat(10_000);
            PebStateHash hash = PebStateHash.compute(longInput);
            assertEquals(64, hash.value().length(),
                "compute() always produces 64-char output regardless of input length");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // SILENT FAILURE
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Silent failure — metamorphic/differential testing")
    class SilentFailure {

        /**
         * Metamorphic test: {@link PebStateHash#compute} must produce
         * different outputs for different inputs. If two different strings
         * produce the same hash, that's a collision (or the function is
         * not using its input — the exact silent-failure bug class).
         *
         * <p>SHA-256 collision resistance means this test is extremely
         * unlikely to fail unless the implementation stops using its input.
         */
        @Test
        @DisplayName("METAMORPHIC: different inputs produce different hashes")
        void metamorphic_differentInputs_shouldProduceDifferentHashes() {
            PebStateHash h1 = PebStateHash.compute("hello");
            PebStateHash h2 = PebStateHash.compute("world");
            PebStateHash h3 = PebStateHash.compute("hello"); // same as h1

            assertNotEquals(h1.value(), h2.value(),
                "Different inputs MUST produce different hashes — "
                + "if they don't, the function is not using its input");

            assertEquals(h1.value(), h3.value(),
                "Same input MUST produce the same hash (determinism)");
        }

        /**
         * Differential test: progressively changing the input should
         * produce progressively different hashes. This catches the case
         * where a hash function returns a constant or only varies based
         * on something other than the input.
         */
        @Test
        @DisplayName("DIFFERENTIAL: progressive input changes produce progressive hash changes")
        void differential_progressiveChanges_shouldProgressiveHashChanges() {
            PebStateHash h1 = PebStateHash.compute("a");
            PebStateHash h2 = PebStateHash.compute("ab");
            PebStateHash h3 = PebStateHash.compute("abc");

            // All three should be different from each other
            assertNotEquals(h1.value(), h2.value(),
                "'a' and 'ab' should produce different hashes");
            assertNotEquals(h2.value(), h3.value(),
                "'ab' and 'abc' should produce different hashes");
            assertNotEquals(h1.value(), h3.value(),
                "'a' and 'abc' should produce different hashes");
        }

        @Test
        @DisplayName("empty string input to compute() produces valid hash")
        void emptyStringInput_compute_producesValidHash() {
            PebStateHash hash = PebStateHash.compute("");
            assertNotNull(hash);
            assertEquals(64, hash.value().length(),
                "Empty string should produce a valid 64-char hash");
            assertTrue(hash.value().matches("^[a-f0-9]{64}$"),
                "Empty string hash should be valid hex");
        }
    }
}
