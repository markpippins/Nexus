package com.aibizarchitect.nexus.v1.spring.topology.dto;

import com.aibizarchitect.nexus.v1.spring.topology.entity.Server;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for {@link SpringPagedResponse} covering green and orange paths.
 */
@DisplayName("SpringPagedResponse")
class SpringPagedResponseTest {

    @Nested
    @DisplayName("Green path — valid page construction")
    class GreenPath {

        @Test
        @DisplayName("single-page result has correct meta")
        void singlePage_correctMeta() {
            List<Server> servers = List.of(
                new Server(1L, "host1", null, null, null, null),
                new Server(2L, "host2", null, null, null, null));
            Page<Server> page = new PageImpl<>(servers, PageRequest.of(0, 10), 2);

            Map<String, Object> result = SpringPagedResponse.fromPage(page);

            @SuppressWarnings("unchecked")
            Map<String, Object> meta = (Map<String, Object>) result.get("meta");
            @SuppressWarnings("unchecked")
            List<Server> data = (List<Server>) result.get("data");

            assertEquals(2, data.size(), "Data should contain 2 servers");
            assertEquals(0, meta.get("page"));
            assertEquals(10, meta.get("per_page"));
            assertEquals(2L, meta.get("total"));
            assertEquals(1, meta.get("last_page"));
        }

        @Test
        @DisplayName("multi-page result has correct page numbers")
        void multiPage_correctPageNumbers() {
            List<Server> servers = List.of(
                new Server(1L, "host1", null, null, null, null));
            Page<Server> page = new PageImpl<>(servers, PageRequest.of(1, 5), 12);

            Map<String, Object> result = SpringPagedResponse.fromPage(page);

            @SuppressWarnings("unchecked")
            Map<String, Object> meta = (Map<String, Object>) result.get("meta");
            assertEquals(1, meta.get("page"));
            assertEquals(5, meta.get("per_page"));
            assertEquals(12L, meta.get("total"));
            assertEquals(3, meta.get("last_page"), "12 items / 5 per page = 3 pages");
        }

        @Test
        @DisplayName("empty page has zero data and correct meta")
        void emptyPage_correctMeta() {
            Page<Server> page = new PageImpl<>(List.of(), PageRequest.of(0, 10), 0);

            Map<String, Object> result = SpringPagedResponse.fromPage(page);

            @SuppressWarnings("unchecked")
            List<Server> data = (List<Server>) result.get("data");
            assertTrue(data.isEmpty(), "Empty page should have empty data");

            @SuppressWarnings("unchecked")
            Map<String, Object> meta = (Map<String, Object>) result.get("meta");
            assertEquals(0L, meta.get("total"));
            assertEquals(0, meta.get("last_page"));
        }
    }

    @Nested
    @DisplayName("Orange path — outside request context")
    class OrangePath {

        /**
         * When called outside a web request context, nextPageUrl should be null
         * but the response should still be built successfully.
         */
        @Test
        @DisplayName("outside request context does not throw")
        void outsideRequestContext_doesNotThrow() {
            List<Server> servers = List.of(
                new Server(1L, "h1", null, null, null, null),
                new Server(2L, "h2", null, null, null, null));
            Page<Server> page = new PageImpl<>(servers, PageRequest.of(0, 1), 5);

            assertDoesNotThrow(() -> SpringPagedResponse.fromPage(page),
                "Should not throw outside web request context");

            Map<String, Object> result = SpringPagedResponse.fromPage(page);
            @SuppressWarnings("unchecked")
            Map<String, Object> meta = (Map<String, Object>) result.get("meta");
            assertNull(meta.get("next_page_url"),
                "next_page_url should be null outside request context");
        }
    }
}
