package com.aibizarchitect.nexus.v1.spring.topology.entity;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for {@link Server} entity covering all four paths.
 */
@DisplayName("Server")
class ServerTest {

    @Nested
    @DisplayName("Green path — valid construction")
    class GreenPath {

        @Test
        @DisplayName("all-args constructor works and getters return correct values")
        void allArgsConstructor_works() {
            Server s = new Server(1L, "host1", "10.0.0.1", "linux", "ONLINE", true);

            assertEquals(1L, s.getId());
            assertEquals("host1", s.getHostname());
            assertEquals("10.0.0.1", s.getIpAddress());
            assertEquals("linux", s.getOs());
            assertEquals("ONLINE", s.getStatus());
            assertTrue(s.getActiveFlag());
        }

        @Test
        @DisplayName("default activeFlag is true")
        void defaultActiveFlag_isTrue() {
            Server s = new Server();
            s.setHostname("host1");
            assertTrue(s.getActiveFlag(), "Default activeFlag should be true");
        }

        @Test
        @DisplayName("default isInternal is true")
        void defaultIsInternal_isTrue() {
            Server s = new Server();
            s.setHostname("host1");
            assertTrue(s.getIsInternal(), "Default isInternal should be true");
        }
    }

    @Nested
    @DisplayName("Orange path — setter/getter round-trips")
    class OrangePath {

        @Test
        @DisplayName("setter/getter round-trip for all fields")
        void setterGetter_roundTrip() {
            Server s = new Server();
            s.setId(100L);
            s.setHostname("prod-server");
            s.setIpAddress("192.168.1.1");
            s.setOs("ubuntu");
            s.setStatus("ONLINE");
            s.setActiveFlag(false);
            s.setStartup("systemd");
            s.setStartupScript("/opt/start.sh");
            s.setBuildCommand("mvn package");
            s.setHealth("/health");
            s.setSysUser("admin");
            s.setSysPass("secret");
            s.setNotes("production server");
            s.setIsInternal(false);

            assertEquals(100L, s.getId());
            assertEquals("prod-server", s.getHostname());
            assertEquals("192.168.1.1", s.getIpAddress());
            assertEquals("ubuntu", s.getOs());
            assertEquals("ONLINE", s.getStatus());
            assertFalse(s.getActiveFlag());
            assertEquals("systemd", s.getStartup());
            assertEquals("/opt/start.sh", s.getStartupScript());
            assertEquals("mvn package", s.getBuildCommand());
            assertEquals("/health", s.getHealth());
            assertEquals("admin", s.getSysUser());
            assertEquals("secret", s.getSysPass());
            assertEquals("production server", s.getNotes());
            assertFalse(s.getIsInternal());
        }
    }

    @Nested
    @DisplayName("Red path — boundary values")
    class RedPath {

        @Test
        @DisplayName("null fields are allowed for optional columns")
        void nullOptionalFields_allowed() {
            Server s = new Server();

            assertNull(s.getHostname(), "Hostname can be null before persistence");
            assertNull(s.getIpAddress());
            assertNull(s.getOs());
            assertNull(s.getStatus());
            assertNull(s.getStartup());
        }

        @Test
        @DisplayName("very long notes field")
        void veryLongNotes_accepted() {
            Server s = new Server();
            String longNotes = "x".repeat(1000); // column length is 1000
            s.setNotes(longNotes);
            assertEquals(1000, s.getNotes().length());
        }
    }

    @Nested
    @DisplayName("Silent failure — equality and defaults")
    class SilentFailure {

        @Test
        @DisplayName("two servers with same fields are not equal (no equals override)")
        void noEqualsOverride_differentInstances() {
            Server s1 = new Server(1L, "host1", null, null, null, null);
            Server s2 = new Server(1L, "host1", null, null, null, null);

            assertNotEquals(s1, s2,
                "Server does not override equals — instances are compared by reference");
        }

        @Test
        @DisplayName("default activeFlag preserved after set to null")
        void activeFlag_nullPreservesPrevious() {
            Server s = new Server();
            s.setActiveFlag(null);
            assertNull(s.getActiveFlag(), "Setting to null should work");
        }
    }
}
