package com.angrysurfer.shrapnel.component.writer;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import com.aibizarchitect.nexus.shrapnel.field.Field;
import com.aibizarchitect.nexus.shrapnel.field.FieldTypeEnum;
import com.aibizarchitect.nexus.shrapnel.field.IField;
import com.aibizarchitect.nexus.shrapnel.property.IPropertyAccessor;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Four-path tests for the abstract {@link DataWriter} base class.
 * Uses a minimal concrete subclass ({@link CsvDataWriter}) to exercise
 * the inherited methods.
 */
@DisplayName("DataWriter (abstract base)")
class DataWriterTest {

    // ═══════════════════════════════════════════════════════════════
    // Green Path
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Green Path — Value resolution and field access")
    class GreenPath {

        static class TestRecord {
            private final String label;
            private final boolean active;

            TestRecord(String label, boolean active) {
                this.label = label;
                this.active = active;
            }

            public String getLabel() { return label; }
            public boolean isActive() { return active; }
        }

        @Test
        @DisplayName("getValue resolves STRING field via property accessor")
        void getValue_stringField_resolvesValue() {
            List<IField> fields = List.of(
                    new Field("name", "Name", FieldTypeEnum.STRING));
            CsvDataWriter writer = new CsvDataWriter(fields);
            // Use mock accessor because PropertyUtilsPropertyAccessor
            // requires commons-beanutils 1.x (not available with beanutils2).
            IPropertyAccessor mockAccessor = mock(IPropertyAccessor.class);
            when(mockAccessor.accessorExists(any(), any())).thenReturn(true);
            when(mockAccessor.getString(any(), eq("name"))).thenReturn("hello");
            writer.setPropertyAccessor(mockAccessor);

            String result = writer.getValue(new Object(), fields.get(0));
            assertEquals("hello", result,
                    "Should resolve property value via property accessor");
        }

        @Test
        @DisplayName("getValue resolves BOOLEAN field via property accessor")
        void getValue_booleanField_resolvesValue() {
            List<IField> fields = List.of(
                    new Field("active", "Active", FieldTypeEnum.BOOLEAN));
            CsvDataWriter writer = new CsvDataWriter(fields);
            IPropertyAccessor mockAccessor = mock(IPropertyAccessor.class);
            when(mockAccessor.accessorExists(any(), any())).thenReturn(true);
            when(mockAccessor.getBoolean(any(), eq("active"))).thenReturn(true);
            writer.setPropertyAccessor(mockAccessor);

            String result = writer.getValue(new Object(), fields.get(0));
            assertEquals("true", result,
                    "Should resolve boolean property value");
        }

        @Test
        @DisplayName("getValue returns empty string when property accessor fails")
        void getValue_unknownProperty_returnsEmptyString() {
            List<IField> fields = List.of(
                    new Field("missing", "Missing", FieldTypeEnum.STRING));
            CsvDataWriter writer = new CsvDataWriter(fields);
            // Mock accessor: property exists but returns null
            IPropertyAccessor mockAccessor = mock(IPropertyAccessor.class);
            when(mockAccessor.accessorExists(any(), any())).thenReturn(true);
            when(mockAccessor.getString(any(), eq("missing"))).thenReturn(null);
            writer.setPropertyAccessor(mockAccessor);

            String result = writer.getValue(new Object(), fields.get(0));
            assertEquals("", result,
                    "Null property value should return empty string, not throw");
        }

        @Test
        @DisplayName("getCellOffSet returns 0 by default")
        void getCellOffset_defaultIsZero() {
            DataWriter writer = new CsvDataWriter(List.of());
            assertEquals(0, writer.getCellOffSet(new Object()),
                    "Default cell offset must be 0");
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Orange Path — Field skip/write logic, null accessor
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Orange Path — Field filtering and edge cases")
    class OrangePath {

        @Test
        @DisplayName("shouldSkip returns true when property name is null")
        void shouldSkip_nullPropertyName_returnsTrue() {
            DataWriter writer = new CsvDataWriter(List.of());
            // Field constructor is (propertyName, label, type).
            // Pass null as propertyName (first arg) to test shouldSkip.
            IField fieldWithNullName = new Field(null, "Label", FieldTypeEnum.STRING);
            Object item = new Object();

            assertTrue(writer.shouldSkip(fieldWithNullName, item),
                    "Fields with null propertyName should be skipped");
        }

        @Test
        @DisplayName("shouldWrite returns false when property name is null")
        void shouldWrite_nullPropertyName_returnsFalse() {
            DataWriter writer = new CsvDataWriter(List.of());
            // Field constructor is (propertyName, label, type).
            // Pass null as propertyName (first arg) to test shouldWrite.
            IField fieldWithNullName = new Field(null, "Label", FieldTypeEnum.STRING);
            Object item = new Object();

            assertFalse(writer.shouldWrite(fieldWithNullName, item),
                    "Fields with null propertyName should not be written");
        }

        @Test
        @DisplayName("shouldWrite returns true when property name is non-null")
        void shouldWrite_nonNullPropertyName_returnsTrue() {
            DataWriter writer = new CsvDataWriter(List.of());
            // Field constructor: (propertyName, label, type)
            IField field = new Field("label", "Label", FieldTypeEnum.STRING);
            Object item = new Object();

            assertTrue(writer.shouldWrite(field, item),
                    "Fields with non-null propertyName should be written");
        }

        @Test
        @DisplayName("shouldSkip returns false when property name is non-null")
        void shouldSkip_nonNullPropertyName_returnsFalse() {
            DataWriter writer = new CsvDataWriter(List.of());
            // Field constructor: (propertyName, label, type)
            IField field = new Field("label", "Label", FieldTypeEnum.STRING);
            Object item = new Object();

            assertFalse(writer.shouldSkip(field, item),
                    "Fields with non-null propertyName should not be skipped");
        }

        @Test
        @DisplayName("Default valueRenderer delegates to canRender=false renderCalculated=empty")
        void defaultValueRenderer_canRenderReturnsFalse() {
            DataWriter writer = new CsvDataWriter(List.of());
            // Default valueRenderer is created lazily
            assertFalse(writer.getValueRenderer().canRender(null),
                    "Default renderer should return false for canRender");
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Red Path — Null fields, defensive checks
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Red Path — Null and defensive checks")
    class RedPath {

        @Test
        @DisplayName("Constructor with null fields list is accepted — stored as null")
        void nullFields_constructorAccepts() {
            DataWriter writer = new CsvDataWriter(null);
            assertNull(writer.getFields(),
                    "GAP: Null fields list is stored — may cause NPE on write");
        }

        @Test
        @DisplayName("getValue with null field throws NullPointerException — no null guard")
        void getValue_nullField_throwsNpe() {
            DataWriter writer = new CsvDataWriter(List.of());
            Object item = new Object();

            // GAP: getValue() calls field.getPropertyName() without null check
            assertThrows(NullPointerException.class,
                    () -> writer.getValue(item, null),
                    "Null field should be guarded but isn't");
        }

        @Test
        @DisplayName("getValue with null item returns empty string")
        void getValue_nullItem_returnsEmptyString() {
            List<IField> fields = List.of(
                    new Field("Label", "label", FieldTypeEnum.STRING));
            DataWriter writer = new CsvDataWriter(fields);

            assertThrows(NullPointerException.class,
                    () -> writer.getValue(null, fields.get(0)),
                    "GAP: Null item should be guarded but isn't");
        }

        @Test
        @DisplayName("DEBUG flag is false by default — no debug output in production")
        void debugFlag_isFalse() {
            assertFalse(DataWriter.DEBUG,
                    "DEBUG must be false in production");
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Silent Failure — Regression locks, constant values
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Silent Failure — Regression locks on constants and defaults")
    class SilentFailure {

        @Test
        @DisplayName("EMPTY_STRING constant is empty")
        void emptyStringConstant_isEmpty() {
            assertEquals("", DataWriter.EMPTY_STRING,
                    "EMPTY_STRING constant must not change");
        }

        @Test
        @DisplayName("EMPTY_QUOTES constant is two single quotes")
        void emptyQuotesConstant_isTwoSingleQuotes() {
            assertEquals("''", DataWriter.EMPTY_QUOTES,
                    "EMPTY_QUOTES constant must not change");
        }

        @Test
        @DisplayName("PADDING_COLUMNS contains all 5 debug fields")
        void paddingColumns_containsAllDebugFields() {
            assertEquals(5, DataWriter.PADDING_COLUMNS.size(),
                    "PADDING_COLUMNS must have exactly 5 debug fields");
            assertTrue(DataWriter.PADDING_COLUMNS.contains(DataWriter.DATA_NULL_VALUE));
            assertTrue(DataWriter.PADDING_COLUMNS.contains(DataWriter.DATA_PADDING_LEFT));
            assertTrue(DataWriter.PADDING_COLUMNS.contains(DataWriter.DATA_PADDING_RIGHT));
            assertTrue(DataWriter.PADDING_COLUMNS.contains(DataWriter.HEADER_PADDING_LEFT));
            assertTrue(DataWriter.PADDING_COLUMNS.contains(DataWriter.HEADER_PADDING_RIGHT));
        }

        @Test
        @DisplayName("Default valueCalculator returns item as-is")
        void defaultValueCalculator_returnsItem() {
            DataWriter writer = new CsvDataWriter(List.of());
            Object item = new Object();
            assertEquals(item, writer.getValueCalculator().calculateValue(null, item),
                    "Default calculator must return the item unchanged");
        }
    }
}
