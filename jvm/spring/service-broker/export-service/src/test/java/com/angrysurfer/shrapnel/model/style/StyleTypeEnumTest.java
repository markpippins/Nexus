package com.angrysurfer.shrapnel.model.style;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("StyleTypeEnum")
class StyleTypeEnumTest {

    @Nested
    @DisplayName("GreenPath - enum values and lookups")
    class GreenPath {

        @Test @DisplayName("all 5 enum values exist")
        void all_values() {
            assertEquals(5, StyleTypeEnum.values().length);
            assertNotNull(StyleTypeEnum.FONT);
            assertNotNull(StyleTypeEnum.MARGIN);
            assertNotNull(StyleTypeEnum.PADDING);
            assertNotNull(StyleTypeEnum.WIDTH);
            assertNotNull(StyleTypeEnum.HEIGHT);
        }

        @Test @DisplayName("FONT has code 1")
        void font_code() {
            assertEquals(1, StyleTypeEnum.FONT.getCode());
            assertEquals("FONT", StyleTypeEnum.FONT.name());
        }

        @Test @DisplayName("MARGIN has code 2")
        void margin_code() {
            assertEquals(2, StyleTypeEnum.MARGIN.getCode());
        }

        @Test @DisplayName("from(String) lookups work")
        void from_string() {
            assertEquals(StyleTypeEnum.FONT, StyleTypeEnum.from("FONT"));
            assertEquals(StyleTypeEnum.MARGIN, StyleTypeEnum.from("MARGIN"));
            assertEquals(StyleTypeEnum.PADDING, StyleTypeEnum.from("PADDING"));
            assertEquals(StyleTypeEnum.WIDTH, StyleTypeEnum.from("WIDTH"));
            assertEquals(StyleTypeEnum.HEIGHT, StyleTypeEnum.from("HEIGHT"));
        }

        @Test @DisplayName("from(int) lookups work")
        void from_int() {
            assertEquals(StyleTypeEnum.FONT, StyleTypeEnum.from(1));
            assertEquals(StyleTypeEnum.MARGIN, StyleTypeEnum.from(2));
            assertEquals(StyleTypeEnum.PADDING, StyleTypeEnum.from(3));
            assertEquals(StyleTypeEnum.WIDTH, StyleTypeEnum.from(4));
            assertEquals(StyleTypeEnum.HEIGHT, StyleTypeEnum.from(5));
        }

        @Test @DisplayName("from(String) is case-sensitive")
        void from_string_caseSensitive() {
            // GAP: requires exact match; lowercase throws
            assertThrows(IllegalArgumentException.class,
                    () -> StyleTypeEnum.from("font"));
            assertThrows(IllegalArgumentException.class,
                    () -> StyleTypeEnum.from("margin"));
        }
    }

    @Nested
    @DisplayName("OrangePath - edge cases")
    class OrangePath {

        @Test @DisplayName("from(String) throws for unknown name")
        void from_string_unknown() {
            assertThrows(IllegalArgumentException.class,
                    () -> StyleTypeEnum.from("NONEXISTENT"));
            assertThrows(IllegalArgumentException.class,
                    () -> StyleTypeEnum.from(""));
        }

        @Test @DisplayName("from(int) throws for unknown code")
        void from_int_unknown() {
            assertThrows(IllegalArgumentException.class,
                    () -> StyleTypeEnum.from(0));
            assertThrows(IllegalArgumentException.class,
                    () -> StyleTypeEnum.from(-1));
            assertThrows(IllegalArgumentException.class,
                    () -> StyleTypeEnum.from(999));
        }
    }

    @Nested
    @DisplayName("RedPath - GAPs")
    class RedPath {

        @Test @DisplayName("null safety on name lookup")
        void null_name() {
            // GAP: from(null) throws NPE from String.join() in error message,
            // before the IllegalArgumentException is constructed
            assertThrows(NullPointerException.class,
                    () -> StyleTypeEnum.from(null));
        }
    }
}
