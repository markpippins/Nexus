package com.aibizarchitect.nexus.shrapnel.property;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("PropertyMapAccessor")
class PropertyMapAccessorTest {

    private PropertyMapAccessor accessor;
    private HashMap<String, Object> map;

    @BeforeEach
    void setUp() {
        accessor = new PropertyMapAccessor();
        map = new HashMap<>();
        map.put("name", "test-name");
        map.put("count", 42.0);
        map.put("active", true);
        map.put("date", new Date());
        map.put("localDate", LocalDate.of(2026, 7, 25));
        map.put("localDateTime", LocalDateTime.of(2026, 7, 25, 14, 30));
        map.put("calendar", Calendar.getInstance());
    }

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath — valid map access")
    class GreenPath {

        @Test
        @DisplayName("getString: reads String from map")
        void getString_readsValue() {
            assertEquals("test-name", accessor.getString(map, "name"));
        }

        @Test
        @DisplayName("getBoolean: reads Boolean from map")
        void getBoolean_readsValue() {
            assertTrue(accessor.getBoolean(map, "active"));
        }

        @Test
        @DisplayName("getDouble: reads Double from map")
        void getDouble_readsValue() {
            assertEquals(42.0, accessor.getDouble(map, "count"), 0.001);
        }

        @Test
        @DisplayName("getDate: reads Date from map")
        void getDate_readsValue() {
            assertNotNull(accessor.getDate(map, "date"));
        }

        @Test
        @DisplayName("getLocalDate: reads LocalDate from map")
        void getLocalDate_readsValue() {
            assertEquals(LocalDate.of(2026, 7, 25), accessor.getLocalDate(map, "localDate"));
        }

        @Test
        @DisplayName("getLocalDateTime: reads LocalDateTime from map")
        void getLocalDateTime_readsValue() {
            assertEquals(LocalDateTime.of(2026, 7, 25, 14, 30),
                    accessor.getLocalDateTime(map, "localDateTime"));
        }

        @Test
        @DisplayName("getCalendar: reads Calendar from map")
        void getCalendar_readsValue() {
            assertNotNull(accessor.getCalendar(map, "calendar"));
        }

        @Test
        @DisplayName("accessorExists: returns true for existing key")
        void accessorExists_returnsTrue() {
            assertTrue(accessor.accessorExists(map, "name"));
        }

        @Test
        @DisplayName("accessorExists: returns false for missing key")
        void accessorExists_returnsFalse() {
            assertFalse(accessor.accessorExists(map, "missing"));
        }

        @Test
        @DisplayName("getPropertyNames: returns all keys")
        void getPropertyNames_returnsAll() {
            Set<String> names = accessor.getPropertyNames(map);
            assertTrue(names.contains("name"));
            assertTrue(names.contains("count"));
        }
    }

    // ── RED PATH ────────────────────────────────────────────────

    @Nested
    @DisplayName("RedPath — error conditions")
    class RedPath {

        @Test
        @DisplayName("getString: null item throws NPE")
        void getString_nullItem() {
            assertThrows(NullPointerException.class, () -> accessor.getString(null, "name"));
        }

        @Test
        @DisplayName("getString: missing key returns null then NPE on toString")
        void getString_missingKey() {
            assertThrows(NullPointerException.class, () -> accessor.getString(map, "missing"));
        }

        @Test
        @DisplayName("getBoolean: wrong type throws ClassCastException")
        void getBoolean_wrongType() {
            assertThrows(ClassCastException.class, () -> accessor.getBoolean(map, "name"));
        }

        @Test
        @DisplayName("getDouble: wrong type throws ClassCastException")
        void getDouble_wrongType() {
            assertThrows(ClassCastException.class, () -> accessor.getDouble(map, "name"));
        }
    }

    // ── SILENT-FAILURE PATH ─────────────────────────────────────

    @Nested
    @DisplayName("SilentFailure — subtle issues")
    class SilentFailure {

        @Test
        @DisplayName("getString: integer value coerced via toString — GAP: no type safety")
        void getString_intCoerced() {
            map.put("number", 123);
            // toString() on Integer returns "123" — works but silently coerces
            assertEquals("123", accessor.getString(map, "number"));
        }

        @Test
        @DisplayName("accessorExists: checks containsKey only, not type compatibility")
        void accessorExists_noTypeCheck() {
            // Key exists but value type doesn't match what caller expects
            assertTrue(accessor.accessorExists(map, "name"));
            // But getDouble would throw ClassCastException
        }
    }
}
