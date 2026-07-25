package org.nexus.peb.adapters.conduit;

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

@DisplayName("ConduitMcpAdapter")
class ConduitMcpAdapterTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private ConduitMcpAdapter adapter;
    private MockRestServiceServer mockServer;

    @BeforeEach
    void setUp() {
        adapter = new ConduitMcpAdapter("http://localhost:3100", mapper);
        RestTemplate rt = (RestTemplate) ReflectionTestUtils.getField(adapter, "restTemplate");
        mockServer = MockRestServiceServer.createServer(rt);
    }

    @AfterEach
    void verifyServer() {
        mockServer.verify();
    }

    private void expectJsonResponse(String urlSuffix, HttpMethod method, String responseJson) {
        mockServer.expect(requestTo("http://localhost:3100" + urlSuffix))
                .andExpect(method(method))
                .andRespond(withSuccess(responseJson, MediaType.APPLICATION_JSON));
    }

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath - successful REST calls")
    class GreenPath {

        @Test
        @DisplayName("submitWorkRequest: POST to /wr/submit")
        void submitWorkRequest_success() throws Exception {
            expectJsonResponse("/wr/submit", HttpMethod.POST, "{\"id\":\"wr-001\"}");
            JsonNode body = mapper.createObjectNode().put("title", "test");

            JsonNode result = adapter.submitWorkRequest(body);

            assertNotNull(result);
            assertEquals("wr-001", result.get("id").asText());
        }

        @Test
        @DisplayName("getWorkRequest: GET from /wr/{id}")
        void getWorkRequest_success() throws Exception {
            expectJsonResponse("/wr/wr-001", HttpMethod.GET, "{\"id\":\"wr-001\",\"status\":\"PENDING\"}");

            JsonNode result = adapter.getWorkRequest("wr-001");

            assertNotNull(result);
            assertEquals("PENDING", result.get("status").asText());
        }

        @Test
        @DisplayName("listWorkRequests: GET from /wr")
        void listWorkRequests_success() throws Exception {
            expectJsonResponse("/wr", HttpMethod.GET, "[{\"id\":\"wr-001\"}]");

            JsonNode result = adapter.listWorkRequests();

            assertNotNull(result);
            assertTrue(result.isArray());
        }

        @Test
        @DisplayName("transitionWorkRequest: POST to /wr/{id}/transition")
        void transitionWorkRequest_success() throws Exception {
            expectJsonResponse("/wr/wr-001/transition", HttpMethod.POST,
                    "{\"id\":\"wr-001\",\"status\":\"IN_PROGRESS\"}");
            JsonNode body = mapper.createObjectNode().put("status", "IN_PROGRESS");

            JsonNode result = adapter.transitionWorkRequest("wr-001", body);

            assertNotNull(result);
            assertEquals("IN_PROGRESS", result.get("status").asText());
        }

        @Test
        @DisplayName("issueReceipt: POST to /vision/receipts")
        void issueReceipt_success() throws Exception {
            expectJsonResponse("/vision/receipts", HttpMethod.POST, "{\"receiptId\":\"r-001\"}");
            JsonNode body = mapper.createObjectNode().put("type", "PLAN_CREATE");

            JsonNode result = adapter.issueReceipt(body);

            assertNotNull(result);
            assertEquals("r-001", result.get("receiptId").asText());
        }

        @Test
        @DisplayName("queryState: GET from /state")
        void queryState_success() throws Exception {
            expectJsonResponse("/state", HttpMethod.GET, "{\"plans\":5}");

            JsonNode result = adapter.queryState();

            assertNotNull(result);
            assertEquals(5, result.get("plans").asInt());
        }

        @Test
        @DisplayName("invokeTool: POST to /tools/call with wrapped payload")
        void invokeTool_success() throws Exception {
            expectJsonResponse("/tools/call", HttpMethod.POST, "{\"result\":\"ok\"}");
            JsonNode args = mapper.createObjectNode().put("key", "value");

            JsonNode result = adapter.invokeTool("test_tool", args);

            assertNotNull(result);
            assertEquals("ok", result.get("result").asText());
        }
    }

    // ── RED PATH ────────────────────────────────────────────────

    @Nested
    @DisplayName("RedPath - server errors")
    class RedPath {

        @Test
        @DisplayName("submitWorkRequest: 500 server error propagates")
        void submitWorkRequest_serverError() throws Exception {
            mockServer.expect(requestTo("http://localhost:3100/wr/submit"))
                    .andExpect(method(HttpMethod.POST))
                    .andRespond(withServerError());
            JsonNode body = mapper.createObjectNode();

            // RestTemplate throws RestClientException (or subclass) on 5xx
            assertThrows(Exception.class, () -> adapter.submitWorkRequest(body));
        }

        @Test
        @DisplayName("getWorkRequest: 404 not found")
        void getWorkRequest_notFound() {
            mockServer.expect(requestTo("http://localhost:3100/wr/nonexistent"))
                    .andExpect(method(HttpMethod.GET))
                    .andRespond(withResourceNotFound());

            assertThrows(Exception.class, () -> adapter.getWorkRequest("nonexistent"));
        }
    }

    // ── ORANGE PATH ─────────────────────────────────────────────

    @Nested
    @DisplayName("OrangePath - edge cases")
    class OrangePath {

        @Test
        @DisplayName("getWorkRequest: empty wrId passes through")
        void getWorkRequest_emptyId() throws Exception {
            expectJsonResponse("/wr/", HttpMethod.GET, "{}");

            JsonNode result = adapter.getWorkRequest("");

            assertNotNull(result);
        }
    }
}
