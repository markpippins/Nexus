package com.aibizarchitect.nexus.shrapnel.property;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("PropertyUtilsPropertyAccessor")
class PropertyUtilsPropertyAccessorTest {

    private PropertyUtilsPropertyAccessor accessor;

    @BeforeEach
    void setUp() {
        accessor = new PropertyUtilsPropertyAccessor();
    }

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath — valid property access")
    class GreenPath {

        @Test
        @DisplayName("getString: reads String property via reflection")
        void getString_readsProperty() {
            TestBean bean = new TestBean("hello", 42);

            assertEquals("hello", accessor.getString(bean, "name"));
        }

        @Test
        @DisplayName("getBoolean: reads boolean property")
        void getBoolean_readsProperty() {
            TestBean bean = new TestBean("x", 0);
            bean.setActive(true);

            assertTrue(accessor.getBoolean(bean, "active"));
        }

        @Test
        @DisplayName("getDouble: reads Double property")
        void getDouble_readsProperty() {
            TestBean bean = new TestBean("x", 0);
            bean.setScore(3.14);

            assertEquals(3.14, accessor.getDouble(bean, "score"), 0.001);
        }

        @Test
        @DisplayName("getDate: reads Date property")
        void getDate_readsProperty() {
            TestBean bean = new TestBean("x", 0);
            Date now = new Date();
            bean.setCreated(now);

            assertEquals(now, accessor.getDate(bean, "created"));
        }

        @Test
        @DisplayName("getLocalDate: reads LocalDate property")
        void getLocalDate_readsProperty() {
            TestBean bean = new TestBean("x", 0);
            LocalDate ld = LocalDate.of(2026, 7, 25);
            bean.setBirthDate(ld);

            assertEquals(ld, accessor.getLocalDate(bean, "birthDate"));
        }

        @Test
        @DisplayName("getLocalDateTime: reads LocalDateTime property")
        void getLocalDateTime_readsProperty() {
            TestBean bean = new TestBean("x", 0);
            LocalDateTime ldt = LocalDateTime.of(2026, 7, 25, 14, 30);
            bean.setUpdated(ldt);

            assertEquals(ldt, accessor.getLocalDateTime(bean, "updated"));
        }

        @Test
        @DisplayName("getCalendar: reads Calendar property")
        void getCalendar_readsProperty() {
            TestBean bean = new TestBean("x", 0);
            Calendar cal = Calendar.getInstance();
            bean.setCal(cal);

            assertEquals(cal, accessor.getCalendar(bean, "cal"));
        }

        @Test
        @DisplayName("accessorExists: returns true for existing property")
        void accessorExists_returnsTrue() {
            TestBean bean = new TestBean("hello", 42);

            assertTrue(accessor.accessorExists(bean, "name"));
        }

        @Test
        @DisplayName("accessorExists: returns false for non-existent property")
        void accessorExists_returnsFalse() {
            TestBean bean = new TestBean("hello", 42);

            assertFalse(accessor.accessorExists(bean, "nonexistent"));
        }

        @Test
        @DisplayName("getPropertyNames: returns all property names")
        void getPropertyNames_returnsAll() {
            TestBean bean = new TestBean("hello", 42);

            Set<String> names = accessor.getPropertyNames(bean);

            assertTrue(names.contains("name"));
            assertTrue(names.contains("value"));
            assertTrue(names.contains("active"));
        }

        @Test
        @DisplayName("getString: nested property access with dot notation")
        void getString_nestedProperty() {
            TestBean inner = new TestBean("inner", 1);
            TestBean outer = new TestBean("outer", 0);
            outer.setChild(inner);

            assertEquals("inner", accessor.getString(outer, "child.name"));
        }

        @Test
        @DisplayName("getString: deeply nested property access")
        void getString_deeplyNested() {
            TestBean leaf = new TestBean("leaf", 1);
            TestBean mid = new TestBean("mid", 0);
            mid.setChild(leaf);
            TestBean root = new TestBean("root", 0);
            root.setChild(mid);

            assertEquals("leaf", accessor.getString(root, "child.child.name"));
        }

        @Test
        @DisplayName("getString: null property value returns null")
        void getString_nullProperty() {
            TestBean bean = new TestBean(null, 42);

            assertNull(accessor.getString(bean, "name"));
        }

        @Test
        @DisplayName("getDouble: null property value returns null")
        void getDouble_nullProperty() {
            TestBean bean = new TestBean("x", 0);
            bean.setScore(null);

            assertNull(accessor.getDouble(bean, "score"));
        }
    }

    // ── ORANGE PATH ─────────────────────────────────────────────

    @Nested
    @DisplayName("OrangePath — edge cases")
    class OrangePath {

        @Test
        @DisplayName("accessorExists: null item throws NPE — GAP: no null guard")
        void accessorExists_nullItem() {
            // PropertyUtils.getPropertyDescriptor(null, ...) throws NPE
            // The catch block only handles InvocationTargetException/IllegalAccessException/NoSuchMethodException
            assertThrows(NullPointerException.class, () -> accessor.accessorExists(null, "name"));
        }

        @Test
        @DisplayName("getString: int property coerced via toString — returns string representation")
        void getString_intProperty() {
            TestBean bean = new TestBean("x", 42);

            // getString() calls value.toString() for ANY non-null value, not just Strings
            assertEquals("42", accessor.getString(bean, "value"));
        }

        @Test
        @DisplayName("getBoolean: non-boolean property returns null")
        void getBoolean_nonBooleanProperty() {
            TestBean bean = new TestBean("x", 42);

            assertNull(accessor.getBoolean(bean, "name"));
        }
    }

    // ── RED PATH ────────────────────────────────────────────────

    @Nested
    @DisplayName("RedPath — error conditions")
    class RedPath {

        @Test
        @DisplayName("getString: null item throws NPE — GAP: no null guard")
        void getString_nullItem() {
            assertThrows(NullPointerException.class, () -> accessor.getString(null, "name"));
        }

        @Test
        @DisplayName("getBoolean: null item throws NPE — GAP: no null guard")
        void getBoolean_nullItem() {
            assertThrows(NullPointerException.class, () -> accessor.getBoolean(null, "active"));
        }

        @Test
        @DisplayName("accessorExists: null item throws NPE — GAP: no null guard")
        void accessorExists_nullItemThrows() {
            // PropertyUtils.getPropertyDescriptor(null, ...) throws NPE
            // The catch block only handles InvocationTargetException/IllegalAccessException/NoSuchMethodException
            assertThrows(NullPointerException.class, () -> accessor.accessorExists(null, "name"));
        }
    }

    // ── SILENT-FAILURE PATH ─────────────────────────────────────

    @Nested
    @DisplayName("SilentFailure — subtle issues")
    class SilentFailure {

        @Test
        @DisplayName("getString: null child in nested path throws NPE — GAP: no null guard on child")
        void getString_nullChild() {
            TestBean bean = new TestBean("root", 0);
            bean.setChild(null);

            // getChildWithProperty returns null when child is null,
            // then PropertyUtils.getPropertyDescriptor(null, ...) throws NPE
            assertThrows(NullPointerException.class, () -> accessor.getString(bean, "child.name"));
        }

        @Test
        @DisplayName("getDouble: int value is not coerced to Double — returns null")
        void getDouble_intCoercionFails() {
            TestBean bean = new TestBean("x", 42); // int, not Double

            // instanceof Double check fails for Integer — returns null instead of coercing
            assertNull(accessor.getDouble(bean, "value"));
        }
    }

    // ── Test bean ───────────────────────────────────────────────

    @SuppressWarnings("unused")
    public static class TestBean {
        private String name;
        private int value;
        private boolean active;
        private Double score;
        private Date created;
        private LocalDate birthDate;
        private LocalDateTime updated;
        private Calendar cal;
        private TestBean child;

        public TestBean(String name, int value) {
            this.name = name;
            this.value = value;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public int getValue() { return value; }
        public void setValue(int value) { this.value = value; }
        public boolean isActive() { return active; }
        public void setActive(boolean active) { this.active = active; }
        public Double getScore() { return score; }
        public void setScore(Double score) { this.score = score; }
        public Date getCreated() { return created; }
        public void setCreated(Date created) { this.created = created; }
        public LocalDate getBirthDate() { return birthDate; }
        public void setBirthDate(LocalDate birthDate) { this.birthDate = birthDate; }
        public LocalDateTime getUpdated() { return updated; }
        public void setUpdated(LocalDateTime updated) { this.updated = updated; }
        public Calendar getCal() { return cal; }
        public void setCal(Calendar cal) { this.cal = cal; }
        public TestBean getChild() { return child; }
        public void setChild(TestBean child) { this.child = child; }
    }
}
