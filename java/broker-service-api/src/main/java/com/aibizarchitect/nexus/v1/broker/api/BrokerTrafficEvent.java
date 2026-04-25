package com.aibizarchitect.nexus.v1.broker.api;

/**
 * Immutable event record emitted by the broker for each request/response cycle.
 * Carried over SSE to connected clients via BrokerTrafficStreamService.
 */
public record BrokerTrafficEvent(
        String eventId,
        String timestamp,
        long durationMs,
        String requestId,
        String service,
        String operation,
        boolean ok,
        int httpStatus,
        String source,
        ServiceRequest request,
        ServiceResponse<?> response,
        String errorMessage) {
}
