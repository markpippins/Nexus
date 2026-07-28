package com.aibizarchitect.nexus.v1.spring.upload;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("LogError")
class LogErrorTest {

    @Nested
    @DisplayName("constructor and accessors")
    class Construction {

        @Test
        @DisplayName("stores lineNumber and line")
        void storesFields() {
            LogError error = new LogError(42, "ERROR: something broke");

            assertEquals(42, error.getLineNumber());
            assertEquals("ERROR: something broke", error.getLine());
        }

        @Test
        @DisplayName("line 0 is valid (first line)")
        void lineZero() {
            LogError error = new LogError(0, "first line");

            assertEquals(0, error.getLineNumber());
        }
    }

    @Nested
    @DisplayName("toString")
    class ToString {

        @Test
        @DisplayName("formats as Line N: content")
        void formatsCorrectly() {
            LogError error = new LogError(5, "error text");

            assertEquals("Line 5: error text", error.toString());
        }

        @Test
        @DisplayName("null line renders as Line N: null")
        void nullLine() {
            LogError error = new LogError(3, null);

            assertEquals("Line 3: null", error.toString());
        }
    }
}
