package com.aibizarchitect.nexus.shrapnel.model;

import com.aibizarchitect.nexus.shrapnel.field.FieldTypeEnum;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Shrapnel Models")
class ShrapnelModelTests {

    @Nested
    @DisplayName("FieldTypeEnum")
    class FieldTypeEnumTests {

        @Test
        @DisplayName("all expected enum values exist")
        void allValuesExist() {
            FieldTypeEnum[] values = FieldTypeEnum.values();
            assertTrue(values.length >= 4, "Should have at least STRING, NUMBER, DATE, BOOLEAN");
        }

        @Test
        @DisplayName("valueOf works for known values")
        void valueOf_knownValues() {
            assertNotNull(FieldTypeEnum.valueOf("STRING"));
            assertNotNull(FieldTypeEnum.valueOf("DOUBLE"));
        }

        @Test
        @DisplayName("valueOf throws for unknown value")
        void valueOf_unknownThrows() {
            assertThrows(IllegalArgumentException.class, () -> FieldTypeEnum.valueOf("INVALID"));
        }
    }

    @Nested
    @DisplayName("ShrapnelException")
    class ShrapnelExceptionTests {

        @Test
        @DisplayName("constructor: message-only")
        void constructor_message() {
            com.aibizarchitect.nexus.shrapnel.exception.ShrapnelException ex =
                    new com.aibizarchitect.nexus.shrapnel.exception.ShrapnelException("Test error", new RuntimeException("cause"));

            assertEquals("Test error", ex.getMessage());
        }

        @Test
        @DisplayName("constructor: message + cause")
        void constructor_messageAndCause() {
            RuntimeException cause = new RuntimeException("root");
            com.aibizarchitect.nexus.shrapnel.exception.ShrapnelException ex =
                    new com.aibizarchitect.nexus.shrapnel.exception.ShrapnelException("wrapper", cause);

            assertEquals("wrapper", ex.getMessage());
            assertEquals(cause, ex.getCause());
        }

        @Test
        @DisplayName("constructor: null message allowed")
        void constructor_nullMessage() {
            com.aibizarchitect.nexus.shrapnel.exception.ShrapnelException ex =
                    new com.aibizarchitect.nexus.shrapnel.exception.ShrapnelException(null, new RuntimeException("cause"));

            assertNull(ex.getMessage());
        }
    }
}
