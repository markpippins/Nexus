package com.aibizarchitect.nexus.shrapnel.field;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Field")
class FieldTest {

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath — valid construction and operations")
    class GreenPath {

        @Test
        @DisplayName("constructor: sets propertyName, label, type")
        void constructor_setsFields() {
            Field f = new Field("firstName", "First Name", FieldTypeEnum.STRING);

            assertEquals("firstName", f.getPropertyName());
            assertEquals("First Name", f.getLabel());
            assertEquals(FieldTypeEnum.STRING, f.getType());
            assertFalse(f.getCalculated());
        }

        @Test
        @DisplayName("constructor: calculated field defaults to false")
        void calculated_defaultsFalse() {
            Field f = new Field("count", "Count", FieldTypeEnum.DOUBLE);

            assertFalse(f.getCalculated());
        }

        @Test
        @DisplayName("cloneWithNewLabel: creates new Field with different label")
        void cloneWithNewLabel_returnsNew() {
            Field original = new Field("email", "Email", FieldTypeEnum.STRING);
            Field cloned = original.cloneWithNewLabel("Email Address");

            assertEquals("Email Address", cloned.getLabel());
            assertEquals("email", cloned.getPropertyName());
            assertEquals(FieldTypeEnum.STRING, cloned.getType());
            assertNotSame(original, cloned);
        }

        @Test
        @DisplayName("cloneWithNewLabel: preserves propertyName and type")
        void cloneWithNewLabel_preservesProps() {
            Field original = new Field("age", "Age", FieldTypeEnum.DOUBLE);
            Field cloned = original.cloneWithNewLabel("User Age");

            assertEquals("age", cloned.getPropertyName());
            assertEquals(FieldTypeEnum.DOUBLE, cloned.getType());
        }

        @Test
        @DisplayName("createFieldSpecs: creates fields from property names")
        void createFieldSpecs_createsFields() {
            List<Field> fields = Field.createFieldSpecs(Arrays.asList("name", "email", "age"));

            assertEquals(3, fields.size());
            assertEquals("NAME", fields.get(0).getLabel());
            assertEquals("EMAIL", fields.get(1).getLabel());
            assertEquals("AGE", fields.get(2).getLabel());
            fields.forEach(f -> assertEquals(FieldTypeEnum.STRING, f.getType()));
        }

        @Test
        @DisplayName("createFieldSpecs: empty list returns empty")
        void createFieldSpecs_emptyList() {
            List<Field> fields = Field.createFieldSpecs(Collections.emptyList());

            assertTrue(fields.isEmpty());
        }

        @Test
        @DisplayName("setCalculated: can mark field as calculated")
        void setCalculated_true() {
            Field f = new Field("total", "Total", FieldTypeEnum.DOUBLE);
            f.setCalculated(true);

            assertTrue(f.getCalculated());
        }

        @Test
        @DisplayName("setIndex: sets display index")
        void setIndex_setsValue() {
            Field f = new Field("name", "Name", FieldTypeEnum.STRING);
            f.setIndex(5);

            assertEquals(5, f.getIndex());
        }
    }

    // ── ORANGE PATH ─────────────────────────────────────────────

    @Nested
    @DisplayName("OrangePath — edge cases")
    class OrangePath {

        @Test
        @DisplayName("constructor: null label is allowed")
        void constructor_nullLabel() {
            Field f = new Field("prop", null, FieldTypeEnum.STRING);

            assertNull(f.getLabel());
            assertEquals("prop", f.getPropertyName());
        }

        @Test
        @DisplayName("constructor: null propertyName is allowed")
        void constructor_nullPropertyName() {
            Field f = new Field(null, "Label", FieldTypeEnum.STRING);

            assertNull(f.getPropertyName());
            assertEquals("Label", f.getLabel());
        }

        @Test
        @DisplayName("createFieldSpecs: special characters in names uppercased")
        void createFieldSpecs_specialChars() {
            List<Field> fields = Field.createFieldSpecs(List.of("first_name", "user-id"));

            assertEquals("FIRST_NAME", fields.get(0).getLabel());
        }
    }

    // ── SILENT-FAILURE PATH ─────────────────────────────────────

    @Nested
    @DisplayName("SilentFailure — subtle behaviors")
    class SilentFailure {

        @Test
        @DisplayName("cloneWithNewLabel: calculated flag is NOT preserved")
        void cloneWithNewLabel_losesCalculated() {
            Field original = new Field("val", "Val", FieldTypeEnum.DOUBLE);
            original.setCalculated(true);
            Field cloned = original.cloneWithNewLabel("New Val");

            // GAP: cloneWithNewLabel creates a new Field via constructor,
            // which defaults calculated to false. The calculated flag is lost.
            assertFalse(cloned.getCalculated());
            assertTrue(original.getCalculated());
        }

        @Test
        @DisplayName("cloneWithNewLabel: index is NOT preserved")
        void cloneWithNewLabel_losesIndex() {
            Field original = new Field("val", "Val", FieldTypeEnum.DOUBLE);
            original.setIndex(10);
            Field cloned = original.cloneWithNewLabel("New Val");

            // GAP: index is not copied during clone
            assertNull(cloned.getIndex());
        }
    }

    // ── DebugField ──────────────────────────────────────────────

    @Nested
    @DisplayName("DebugField")
    class DebugFieldTests {

        @Test
        @DisplayName("getLabel: always returns empty string")
        void getLabel_returnsEmpty() {
            Field.DebugField df = new Field.DebugField("prop", "Should Be Hidden", FieldTypeEnum.STRING);

            assertEquals("", df.getLabel());
            assertEquals("prop", df.getPropertyName());
        }
    }
}
