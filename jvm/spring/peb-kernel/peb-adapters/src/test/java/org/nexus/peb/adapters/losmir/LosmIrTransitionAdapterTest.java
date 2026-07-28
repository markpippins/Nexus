package org.nexus.peb.adapters.losmir;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

@DisplayName("LosmIrTransitionAdapter")
class LosmIrTransitionAdapterTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private LosmIrTransitionAdapter adapter;
    private MockRestServiceServer mockServer;

    @BeforeEach
    void setUp() {
        adapter = new LosmIrTransitionAdapter("http://localhost:8006", mapper);
        RestTemplate rt = (RestTemplate) ReflectionTestUtils.getField(adapter, "restTemplate");
        mockServer = MockRestServiceServer.createServer(rt);
    }

    @AfterEach
    void verifyServer() {
        mockServer.verify();
    }

    private void expectJsonResponse(String urlSuffix, HttpMethod method, String responseJson) {
        mockServer.expect(requestTo("http://localhost:8006" + urlSuffix))
                .andExpect(method(method))
                .andRespond(withSuccess(responseJson, MediaType.APPLICATION_JSON));
    }

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath - successful transitions")
    class GreenPath {

        @Test
        @DisplayName("transition: POST to /work-requests/{id}/transition")
        void transition_success() throws Exception {
            expectJsonResponse("/work-requests/wr-001/transition", HttpMethod.POST,
                    "{\"id\":\"wr-001\",\"state\":\"IN_PROGRESS\"}");

            JsonNode result = adapter.transition("wr-001", "IN_PROGRESS", "architect", "approved");

            assertNotNull(result);
            assertEquals("IN_PROGRESS", result.get("state").asText());
        }

        @Test
        @DisplayName("getWorkRequest: GET from /work-requests/{id}")
        void getWorkRequest_success() throws Exception {
            expectJsonResponse("/work-requests/wr-001", HttpMethod.GET,
                    "{\"id\":\"wr-001\",\"state\":\"COMPLETED\"}");

            JsonNode result = adapter.getWorkRequest("wr-001");

            assertNotNull(result);
            assertEquals("COMPLETED", result.get("state").asText());
        }

        @Test
        @DisplayName("orchestrate: POST to /work-requests/{id}/orchestrate")
        void orchestrate_success() throws Exception {
            expectJsonResponse("/work-requests/wr-001/orchestrate", HttpMethod.POST,
                    "{\"id\":\"wr-001\",\"orchestrated\":true}");

            JsonNode result = adapter.orchestrate("wr-001");

            assertNotNull(result);
            assertTrue(result.get("orchestrated").asBoolean());
        }
    }

    // ── RED PATH ────────────────────────────────────────────────

    @Nested
    @DisplayName("RedPath - server errors")
    class RedPath {

        @Test
        @DisplayName("transition: 500 server error propagates")
        void transition_serverError() {
            mockServer.expect(requestTo("http://localhost:8006/work-requests/wr-001/transition"))
                    .andExpect(method(HttpMethod.POST))
                    .andRespond(withServerError());

            assertThrows(Exception.class,
                    () -> adapter.transition("wr-001", "IN_PROGRESS", "architect", "reason"));
        }

        @Test
        @DisplayName("getWorkRequest: 404 not found")
        void getWorkRequest_notFound() {
            mockServer.expect(requestTo("http://localhost:8006/work-requests/nonexistent"))
                    .andExpect(method(HttpMethod.GET))
                    .andRespond(withResourceNotFound());

            assertThrows(Exception.class, () -> adapter.getWorkRequest("nonexistent"));
        }

        @Test
        @DisplayName("orchestrate: 503 service unavailable")
        void orchestrate_serviceUnavailable() {
            mockServer.expect(requestTo("http://localhost:8006/work-requests/wr-001/orchestrate"))
                    .andExpect(method(HttpMethod.POST))
                    .andRespond(withServerError());

            assertThrows(Exception.class, () -> adapter.orchestrate("wr-001"));
        }
    }

    // ── ORANGE PATH ─────────────────────────────────────────────

    @Nested
    @DisplayName("OrangePath - edge cases")
    class OrangePath {

        @Test
        @DisplayName("transition: empty reason passes through")
        void transition_emptyReason() throws Exception {
            expectJsonResponse("/work-requests/wr-001/transition", HttpMethod.POST,
                    "{\"id\":\"wr-001\"}");

            JsonNode result = adapter.transition("wr-001", "DONE", "engineer", "");

            assertNotNull(result);
        }

        @Test
        @DisplayName("transition: empty wrId passes through")
        void transition_emptyWrId() throws Exception {
            expectJsonResponse("/work-requests/transition", HttpMethod.POST, "{}");

            JsonNode result = adapter.transition("", "DONE", "engineer", "done");

            assertNotNull(result);
        }
    }
}
