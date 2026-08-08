package org.nexus.peb.domain.port;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Port for communicating with the conduit-mcp server (port 3100).
 * 
 * Conduit-mcp is the receipt-first authority for the pipeline system.
 * It manages plan lifecycle, issues receipts, and serves SSE events.
 * 
 * This port defines the operations peb-kernel needs from conduit-mcp:
 * - Submitting work requests
 * - Querying work request state
 * - Recording governance events as receipts
 */
public interface ConduitMcpPort {

    /**
     * Submit a work request to conduit-mcp.
     * 
     * @param workRequest the work request payload (wrId, intent, constraints, etc.)
     * @return the conduit-mcp response with plan number and receipt
     */
    JsonNode submitWorkRequest(JsonNode workRequest);

    /**
     * Get the current state of a work request.
     * 
     * @param wrId the work request ID
     * @return the work request state
     */
    JsonNode getWorkRequest(String wrId);

    /**
     * Apply a transition to a work request.
     * 
     * @param wrId the work request ID
     * @param transition the transition payload (toState, reason, etc.)
     * @return the transition result
     */
    JsonNode transitionWorkRequest(String wrId, JsonNode transition);

    /**
     * Record a governance event as a receipt in conduit-mcp.
     * 
     * @param receipt the receipt payload (eventId, eventType, hash, issuer, etc.)
     * @return the receipt confirmation
     */
    JsonNode issueReceipt(JsonNode receipt);

    /**
     * Query conduit-mcp state.
     * 
     * @return the full conduit state
     */
    JsonNode queryState();
}
