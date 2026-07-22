package org.nexus.peb.adapters.conduit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.nexus.peb.domain.port.ConduitMcpPort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/**
 * REST client adapter for conduit-mcp (port 3100).
 * 
 * Conduit-mcp is the receipt-first authority for the pipeline system.
 * This adapter provides the write path for PEB → conduit integration:
 * - Submit work requests
 * - Query work request state
 * - Record governance events as receipts
 */
@Component
public class ConduitMcpAdapter implements ConduitMcpPort {

    private static final Logger log = LoggerFactory.getLogger(ConduitMcpAdapter.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String baseUrl;

    public ConduitMcpAdapter(
            @Value("${peb.conduit.url:http://localhost:3100}") String baseUrl,
            ObjectMapper objectMapper) {
        this.restTemplate = new RestTemplate();
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl;
    }

    @Override
    public JsonNode submitWorkRequest(JsonNode workRequest) {
        return post("/wr/submit", workRequest);
    }

    @Override
    public JsonNode getWorkRequest(String wrId) {
        return get("/wr/" + wrId);
    }

    @Override
    public JsonNode listWorkRequests() {
        return get("/wr");
    }

    @Override
    public JsonNode transitionWorkRequest(String wrId, JsonNode transition) {
        return post("/wr/" + wrId + "/transition", transition);
    }

    @Override
    public JsonNode issueReceipt(JsonNode receipt) {
        return post("/vision/receipts", receipt);
    }

    @Override
    public JsonNode queryState() {
        return get("/state");
    }

    /**
     * Invoke an MCP tool on conduit-mcp.
     * 
     * @param toolName the tool name (e.g., "create_plan", "issue_receipt")
     * @param arguments the tool arguments
     * @return the tool result
     */
    public JsonNode invokeTool(String toolName, JsonNode arguments) {
        try {
            var payload = objectMapper.createObjectNode();
            payload.put("name", toolName);
            payload.set("arguments", arguments);
            return post("/tools/call", payload);
        } catch (Exception e) {
            log.error("Failed to invoke conduit tool {}: {}", toolName, e.getMessage());
            throw e;
        }
    }

    private JsonNode get(String path) {
        try {
            ResponseEntity<JsonNode> response = restTemplate.exchange(
                    baseUrl + path,
                    HttpMethod.GET,
                    new HttpEntity<>(createHeaders()),
                    JsonNode.class
            );
            return response.getBody();
        } catch (RestClientException e) {
            log.error("GET {} failed: {}", path, e.getMessage());
            throw e;
        }
    }

    private JsonNode post(String path, JsonNode body) {
        try {
            ResponseEntity<JsonNode> response = restTemplate.exchange(
                    baseUrl + path,
                    HttpMethod.POST,
                    new HttpEntity<>(body, createHeaders()),
                    JsonNode.class
            );
            return response.getBody();
        } catch (RestClientException e) {
            log.error("POST {} failed: {}", path, e.getMessage());
            throw e;
        }
    }

    private HttpHeaders createHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }
}
