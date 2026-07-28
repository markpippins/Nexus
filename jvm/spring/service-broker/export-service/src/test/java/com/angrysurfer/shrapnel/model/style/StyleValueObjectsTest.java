package com.angrysurfer.shrapnel.model.style;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Style Value Objects")
class StyleValueObjectsTest {

    @Nested
    @DisplayName("StyleTypeEnum")
    class StyleTypeEnumTests {
        // See StyleTypeEnumTest.java for full coverage
        @Test @DisplayName("5 styles: FONT, MARGIN, PADDING, WIDTH, HEIGHT")
        void allStylesExist() {
            assertEquals(5, StyleTypeEnum.values().length);
        }
    }

    @Nested
    @DisplayName("PdfPageSize")
    class PdfPageSizeTests {

        @Test @DisplayName("setters and getters")
        void settersAndGetters() {
            PdfPageSize pageSize = new PdfPageSize();
            pageSize.setId(1);
            pageSize.setName("A4");
            pageSize.setWidth(595.0f);
            pageSize.setHeight(842.0f);

            assertEquals(1, pageSize.getId());
            assertEquals("A4", pageSize.getName());
            assertEquals(595.0f, pageSize.getWidth(), 0.01f);
            assertEquals(842.0f, pageSize.getHeight(), 0.01f);
        }

        @Test @DisplayName("default constructor has null fields")
        void defaultConstructor() {
            PdfPageSize pageSize = new PdfPageSize();
            assertNull(pageSize.getId());
            assertNull(pageSize.getName());
        }

        @Test @DisplayName("zero dimensions allowed")
        void zeroDimensions() {
            PdfPageSize pageSize = new PdfPageSize();
            pageSize.setWidth(0f);
            pageSize.setHeight(0f);

            assertEquals(0f, pageSize.getWidth(), 0.01f);
        }
    }

    @Nested
    @DisplayName("StyleType")
    class StyleTypeTests {

        @Test @DisplayName("code and name fields")
        void codeAndName() {
            StyleType st = new StyleType();
            st.setCode(1);
            st.setName("FONT");

            assertEquals(1, st.getCode());
            assertEquals("FONT", st.getName());
        }
    }

    @Nested
    @DisplayName("Style")
    class StyleTests {

        @Test @DisplayName("id, name, value fields")
        void basicFields() {
            Style style = new Style();
            style.setId(1L);
            style.setName("header-font-size");
            style.setValue("14pt");

            assertEquals(1L, style.getId());
            assertEquals("header-font-size", style.getName());
            assertEquals("14pt", style.getValue());
        }

        @Test @DisplayName("getType() returns StyleTypeEnum from StyleType")
        void getType_returns_enum() {
            StyleType st = new StyleType();
            st.setCode(StyleTypeEnum.FONT.getCode());
            st.setName("FONT");

            Style style = new Style();
            style.setStyleType(st);

            assertEquals(StyleTypeEnum.FONT, style.getType());
        }

        @Test @DisplayName("getType() with null StyleType")
        void getType_null_styleType() {
            Style style = new Style();
            assertNull(style.getType());
        }
    }
}
