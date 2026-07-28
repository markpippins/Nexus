package com.aibizarchitect.nexus.v1.spring.fs;

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

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

@DisplayName("RestFsClient")
class RestFsClientTest {

    private RestFsClient client;
    private MockRestServiceServer mockServer;

    @BeforeEach
    void setUp() {
        client = new RestFsClient(new RestTemplate());
        // Inject apiUrl (normally from @Value, null outside Spring context)
        ReflectionTestUtils.setField(client, "apiUrl", "http://localhost:3000/api/fs");
        // Access internal RestTemplate for mock server binding
        RestTemplate internalRt = (RestTemplate) ReflectionTestUtils.getField(client, "restTemplate");
        mockServer = MockRestServiceServer.createServer(internalRt);
    }

    @AfterEach
    void verifyServer() {
        mockServer.verify();
    }

    private void expectJsonResponse(String responseJson) {
        mockServer.expect(requestTo("http://localhost:3000/api/fs"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(responseJson, MediaType.APPLICATION_JSON));
    }

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath - successful FS operations")
    class GreenPath {

        @Test
        @DisplayName("changeDirectory: POST cd request")
        void changeDirectory_success() {
            expectJsonResponse("{\"success\":true,\"path\":\"/home\"}");

            Map<String, Object> result = client.changeDirectory("alice", List.of("home"));

            assertNotNull(result);
        }

        @Test
        @DisplayName("createDirectory: POST mkdir request")
        void createDirectory_success() {
            expectJsonResponse("{\"success\":true,\"path\":\"/newdir\"}");

            Map<String, Object> result = client.createDirectory("alice", List.of("newdir"));

            assertNotNull(result);
        }
    }

    // ── RED PATH ────────────────────────────────────────────────

    @Nested
    @DisplayName("RedPath - server errors")
    class RedPath {

        @Test
        @DisplayName("changeDirectory: 500 server error")
        void changeDirectory_serverError() {
            mockServer.expect(requestTo("http://localhost:3000/api/fs"))
                    .andExpect(method(HttpMethod.POST))
                    .andRespond(withServerError());

            assertThrows(Exception.class,
                    () -> client.changeDirectory("alice", List.of("bad")));
        }

        @Test
        @DisplayName("listFiles: 404 not found")
        void listFiles_notFound() {
            mockServer.expect(requestTo("http://localhost:3000/api/fs"))
                    .andExpect(method(HttpMethod.POST))
                    .andRespond(withResourceNotFound());

            assertThrows(Exception.class,
                    () -> client.listFiles("alice", List.of("nonexistent")));
        }
    }

    // ── ORANGE PATH ─────────────────────────────────────────────

    @Nested
    @DisplayName("OrangePath - edge cases")
    class OrangePath {

        @Test
        @DisplayName("changeDirectory: empty path list")
        void changeDirectory_emptyPath() {
            expectJsonResponse("{\"success\":true,\"path\":\"\"}");

            Map<String, Object> result = client.changeDirectory("alice", List.of());

            assertNotNull(result);
        }
    }
}
