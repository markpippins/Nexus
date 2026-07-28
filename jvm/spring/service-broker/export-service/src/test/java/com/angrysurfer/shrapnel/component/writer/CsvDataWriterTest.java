package com.angrysurfer.shrapnel.component.writer;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.aibizarchitect.nexus.shrapnel.exception.ShrapnelException;
import com.aibizarchitect.nexus.shrapnel.field.Field;
import com.aibizarchitect.nexus.shrapnel.field.FieldTypeEnum;
import com.aibizarchitect.nexus.shrapnel.field.IField;
import com.aibizarchitect.nexus.shrapnel.property.IPropertyAccessor;
import com.angrysurfer.shrapnel.util.FileUtil;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@DisplayName("CsvDataWriter")
class CsvDataWriterTest {

    @TempDir
    Path tempDir;

    private Path csvFile;
    private List<IField> fields;

    @BeforeEach
    void setUp() {
        csvFile = tempDir.resolve("test-output.csv");
        // Field constructor: (propertyName, label, type)
        fields = List.of(
                new Field("name", "Name", FieldTypeEnum.STRING),
                new Field("age", "Age", FieldTypeEnum.STRING));
    }

    /**
     * Creates a CsvDataWriter with a mock property accessor.
     * Needed because PropertyUtilsPropertyAccessor requires
     * commons-beanutils 1.x (not available with beanutils2).
     */
    private CsvDataWriter writerWithMockAccessor() {
        CsvDataWriter writer = new CsvDataWriter(fields);
        IPropertyAccessor mockAccessor = mock(IPropertyAccessor.class);
        when(mockAccessor.accessorExists(any(), any())).thenReturn(true);
        writer.setPropertyAccessor(mockAccessor);
        return writer;
    }

    @AfterEach
    void tearDown() throws IOException {
        Files.deleteIfExists(csvFile);
    }

    // ═══════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════

    static class TestRecord {
        private final String name;
        private final int age;

        TestRecord(String name, int age) {
            this.name = name;
            this.age = age;
        }

        public String getName() { return name; }
        public int getAge() { return age; }
    }

    private Map<String, Object> outputConfig() {
        return Map.of(FileUtil.FILENAME, csvFile.toString());
    }

    // ═══════════════════════════════════════════════════════════════
    // Green Path
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Green Path — Successful CSV writing")
    class GreenPath {

        @Test
        @DisplayName("Writes data to CSV file with default comma delimiter")
        void writesDataToCsvFile() throws Exception {
            CsvDataWriter writer = writerWithMockAccessor();
            IPropertyAccessor accessor = writer.getPropertyAccessor();
            when(accessor.getString(any(), eq("name"))).thenReturn("Alice", "Bob");
            when(accessor.getString(any(), eq("age"))).thenReturn("30", "25");
            Collection<Object> items = List.of(
                    new TestRecord("Alice", 30),
                    new TestRecord("Bob", 25));

            writer.writeData(outputConfig(), items);

            String content = Files.readString(csvFile);
            assertTrue(content.contains("Alice"),
                    "CSV should contain the first record: " + content);
            assertTrue(content.contains("Bob"),
                    "CSV should contain the second record: " + content);
        }

        @Test
        @DisplayName("Writes data with custom delimiter (pipe)")
        void writesDataWithCustomDelimiter() throws Exception {
            CsvDataWriter writer = new CsvDataWriter(fields, "|");
            IPropertyAccessor accessor = mock(IPropertyAccessor.class);
            when(accessor.accessorExists(any(), any())).thenReturn(true);
            when(accessor.getString(any(), eq("name"))).thenReturn("Alice");
            when(accessor.getString(any(), eq("age"))).thenReturn("30");
            writer.setPropertyAccessor(accessor);
            Collection<Object> items = List.of(new TestRecord("Alice", 30));

            writer.writeData(outputConfig(), items);

            String content = Files.readString(csvFile);
            // Default: spaceAfterDelim adds space AFTER the delimiter.
            // With "|" delimiter: "Alice| 30" (pipe + space, not space + pipe).
            assertTrue(content.contains("Alice| 30"),
                    "CSV with pipe delimiter: " + content);
        }

        @Test
        @DisplayName("Writes multiple rows correctly")
        void writesMultipleRows() throws Exception {
            CsvDataWriter writer = new CsvDataWriter(fields);
            Collection<Object> items = List.of(
                    new TestRecord("Alice", 30),
                    new TestRecord("Bob", 25),
                    new TestRecord("Charlie", 35));

            writer.writeData(outputConfig(), items);

            List<String> lines = Files.readAllLines(csvFile);
            assertEquals(3, lines.size(),
                    "Should have 3 lines, one per record: " + lines);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Orange Path — Empty collections, edge cases
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Orange Path — Empty collections and edge cases")
    class OrangePath {

        @Test
        @DisplayName("Empty items collection produces empty file")
        void emptyItems_producesEmptyFile() throws Exception {
            CsvDataWriter writer = new CsvDataWriter(fields);

            writer.writeData(outputConfig(), List.of());

            String content = Files.readString(csvFile);
            assertEquals("", content,
                    "Empty items should produce empty file: " + content);
        }

        @Test
        @DisplayName("Empty fields list writes rows but no columns")
        void emptyFields_writesRowsWithNoColumns() throws Exception {
            CsvDataWriter writer = new CsvDataWriter(List.of());
            Collection<Object> items = List.of(new TestRecord("Alice", 30));

            writer.writeData(outputConfig(), items);

            String content = Files.readString(csvFile);
            // Each row is just a newline since there are no fields
            assertEquals("\n", content);
        }

        @Test
        @DisplayName("Items with null property values write empty string")
        void nullPropertyValue_writesEmptyString() throws Exception {
            CsvDataWriter writer = writerWithMockAccessor();
            IPropertyAccessor accessor = writer.getPropertyAccessor();
            when(accessor.getString(any(), eq("name"))).thenReturn(null);
            when(accessor.getString(any(), eq("age"))).thenReturn("0");
            TestRecord record = new TestRecord(null, 0);
            Collection<Object> items = List.of(record);

            writer.writeData(outputConfig(), items);

            String content = Files.readString(csvFile);
            assertTrue(content.contains(", 0"),
                    "Null name should be empty, age should be 0: " + content);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Red Path — Null inputs, invalid files
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Red Path — Null inputs and error conditions")
    class RedPath {

        @Test
        @DisplayName("Null items collection throws NullPointerException")
        void nullItems_throwsNpe() {
            CsvDataWriter writer = new CsvDataWriter(fields);

            assertThrows(NullPointerException.class,
                    () -> writer.writeData(outputConfig(), null),
                    "GAP: Null items should be guarded but isn't");
        }

        @Test
        @DisplayName("Null output config throws NullPointerException")
        void nullOutputConfig_throwsNpe() {
            CsvDataWriter writer = new CsvDataWriter(fields);
            Collection<Object> items = List.of(new TestRecord("Alice", 30));

            assertThrows(NullPointerException.class,
                    () -> writer.writeData(null, items),
                    "GAP: Null output config should be guarded but isn't");
        }

        @Test
        @DisplayName("Missing FILENAME key in outputConfig throws NullPointerException")
        void missingFilename_throwsNpe() {
            CsvDataWriter writer = new CsvDataWriter(fields);
            Collection<Object> items = List.of(new TestRecord("Alice", 30));

            assertThrows(NullPointerException.class,
                    () -> writer.writeData(Map.of(), items),
                    "GAP: Missing FILENAME should produce a clear error, not NPE");
        }

        @Test
        @DisplayName("Invalid file path throws ShrapnelException")
        void invalidFilePath_throwsShrapnelException() {
            CsvDataWriter writer = new CsvDataWriter(fields);
            Collection<Object> items = List.of(new TestRecord("Alice", 30));
            Map<String, Object> config = Map.of(FileUtil.FILENAME, "/invalid/path/that/does/not/exist/test.csv");

            assertThrows(ShrapnelException.class,
                    () -> writer.writeData(config, items));
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Silent Failure — Regression locks
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Silent Failure — Regression and determinism checks")
    class SilentFailure {

        @Test
        @DisplayName("Deterministic: same input produces identical output")
        void deterministicOutput() throws Exception {
            Collection<Object> items = List.of(new TestRecord("Alice", 30));

            CsvDataWriter writer1 = new CsvDataWriter(fields);
            writer1.writeData(outputConfig(), items);
            String content1 = Files.readString(csvFile);

            Files.delete(csvFile);

            CsvDataWriter writer2 = new CsvDataWriter(fields);
            writer2.writeData(outputConfig(), items);
            String content2 = Files.readString(csvFile);

            assertEquals(content1, content2,
                    "Same input must produce identical CSV output");
        }

        @Test
        @DisplayName("Default delimiter is comma")
        void defaultDelimiter_isComma() {
            CsvDataWriter writer = new CsvDataWriter(fields);
            assertEquals(",", writer.getDelimiter(),
                    "Default delimiter must be comma — callers depend on this");
        }

        @Test
        @DisplayName("spaceAfterDelim is true by default")
        void spaceAfterDelim_defaultIsTrue() {
            CsvDataWriter writer = new CsvDataWriter(fields);
            assertTrue(writer.isSpaceAfterDelim(),
                    "Space after delimiter should be true by default");
        }
    }
}
