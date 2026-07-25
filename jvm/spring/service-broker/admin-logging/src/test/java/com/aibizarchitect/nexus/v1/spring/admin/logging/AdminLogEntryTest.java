package com.aibizarchitect.nexus.v1.spring.admin.logging;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("AdminLogEntry")
class AdminLogEntryTest {

    @Nested
    @DisplayName("builder and accessors")
    class Builder {

        @Test
        @DisplayName("builder creates entry with all fields")
        void builderCreatesEntry() {
            UUID id = UUID.randomUUID();
            LocalDateTime now = LocalDateTime.now();

            AdminLogEntry entry = AdminLogEntry.builder()
                    .id(id)
                    .timestamp(now)
                    .serverId("srv-1")
                    .serverPort(8080)
                    .userId("user-1")
                    .service("test-service")
                    .operation("testOp")
                    .requestId("req-123")
                    .successStatus(true)
                    .build();

            assertEquals(id, entry.getId());
            assertEquals(now, entry.getTimestamp());
            assertEquals("srv-1", entry.getServerId());
            assertEquals(8080, entry.getServerPort());
            assertEquals("user-1", entry.getUserId());
            assertEquals("test-service", entry.getService());
            assertEquals("testOp", entry.getOperation());
            assertEquals("req-123", entry.getRequestId());
            assertTrue(entry.getSuccessStatus());
        }

        @Test
        @DisplayName("no-arg constructor creates empty entry")
        void noArgConstructor() {
            AdminLogEntry entry = new AdminLogEntry();

            assertNull(entry.getId());
            assertNull(entry.getTimestamp());
        }
    }

    @Nested
    @DisplayName("status and error handling")
    class Status {

        @Test
        @DisplayName("successStatus can be set to false")
        void successStatusFalse() {
            AdminLogEntry entry = AdminLogEntry.builder()
                    .successStatus(false)
                    .errorMessage("Connection refused")
                    .build();

            assertFalse(entry.getSuccessStatus());
            assertEquals("Connection refused", entry.getErrorMessage());
        }

        @Test
        @DisplayName("null successStatus means unset")
        void successStatusNull() {
            AdminLogEntry entry = new AdminLogEntry();

            assertNull(entry.getSuccessStatus());
        }
    }
}
