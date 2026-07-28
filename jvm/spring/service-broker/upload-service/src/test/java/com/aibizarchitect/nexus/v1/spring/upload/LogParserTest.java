package com.aibizarchitect.nexus.v1.spring.upload;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("LogParser")
class LogParserTest {

    @TempDir
    Path tempDir;

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath — valid log parsing")
    class GreenPath {

        @Test
        @DisplayName("parses log file and finds ERROR lines")
        void parsesErrorsInLog() throws IOException {
            Path logFile = tempDir.resolve("test.log");
            Files.writeString(logFile, "INFO: Starting\nERROR: Something broke\nINFO: Continuing\n");

            List<LogError> errors = LogParser.parseLogFile(logFile, List.of("ERROR"));

            assertEquals(1, errors.size());
            assertEquals(2, errors.get(0).getLineNumber());
            assertTrue(errors.get(0).getLine().contains("ERROR"));
        }

        @Test
        @DisplayName("parses log file with multiple keywords")
        void parsesMultipleKeywords() throws IOException {
            Path logFile = tempDir.resolve("test.log");
            Files.writeString(logFile, "INFO: ok\nERROR: fail\nWARN: uh oh\nFATAL: dead\n");

            List<LogError> errors = LogParser.parseLogFile(logFile,
                    List.of("ERROR", "FATAL"));

            assertEquals(2, errors.size());
            assertEquals(2, errors.get(0).getLineNumber());
            assertEquals(4, errors.get(1).getLineNumber());
        }

        @Test
        @DisplayName("returns empty list when no keywords match")
        void noMatches() throws IOException {
            Path logFile = tempDir.resolve("clean.log");
            Files.writeString(logFile, "INFO: all good\nDEBUG: nothing\n");

            List<LogError> errors = LogParser.parseLogFile(logFile, List.of("ERROR"));

            assertTrue(errors.isEmpty());
        }

        @Test
        @DisplayName("handles empty log file")
        void emptyFile() throws IOException {
            Path logFile = tempDir.resolve("empty.log");
            Files.createFile(logFile);

            List<LogError> errors = LogParser.parseLogFile(logFile, List.of("ERROR"));

            assertTrue(errors.isEmpty());
        }
    }

    // ── ORANGE PATH ─────────────────────────────────────────────

    @Nested
    @DisplayName("OrangePath — edge cases")
    class OrangePath {

        @Test
        @DisplayName("empty keyword list returns no errors")
        void emptyKeywords() throws IOException {
            Path logFile = tempDir.resolve("test.log");
            Files.writeString(logFile, "ERROR: something\n");

            List<LogError> errors = LogParser.parseLogFile(logFile, List.of());

            assertTrue(errors.isEmpty());
        }

        @Test
        @DisplayName("keyword match is case-sensitive")
        void caseSensitive() throws IOException {
            Path logFile = tempDir.resolve("test.log");
            Files.writeString(logFile, "error: lowercase\nERROR: uppercase\n");

            List<LogError> errors = LogParser.parseLogFile(logFile, List.of("ERROR"));

            assertEquals(1, errors.size());
            assertEquals(2, errors.get(0).getLineNumber());
        }

        @Test
        @DisplayName("multiple keywords on same line only counted once")
        void singleCountPerLine() throws IOException {
            Path logFile = tempDir.resolve("test.log");
            Files.writeString(logFile, "ERROR: FAILURE: something\n");

            List<LogError> errors = LogParser.parseLogFile(logFile,
                    List.of("ERROR", "FAILURE"));

            // Both keywords match but break prevents duplicate entry
            assertEquals(1, errors.size());
        }
    }

    // ── RED PATH ────────────────────────────────────────────────

    @Nested
    @DisplayName("RedPath — error conditions")
    class RedPath {

        @Test
        @DisplayName("throws IOException for non-existent file")
        void nonExistentFile() {
            Path missing = tempDir.resolve("does-not-exist.log");

            assertThrows(IOException.class,
                    () -> LogParser.parseLogFile(missing, List.of("ERROR")));
        }

        @Test
        @DisplayName("null path throws NPE")
        void nullPath() {
            assertThrows(NullPointerException.class,
                    () -> LogParser.parseLogFile(null, List.of("ERROR")));
        }
    }

    // ── SILENT-FAILURE PATH ─────────────────────────────────────

    @Nested
    @DisplayName("SilentFailure — subtle behaviors")
    class SilentFailure {

        @Test
        @DisplayName("null keyword list throws NPE")
        void nullKeywords() throws IOException {
            Path logFile = tempDir.resolve("test.log");
            Files.writeString(logFile, "test\n");

            assertThrows(NullPointerException.class,
                    () -> LogParser.parseLogFile(logFile, null));
        }
    }
}
