package com.aibizarchitect.nexus.v1.spring.broker;

/**
 * @deprecated Moved to com.aibizarchitect.nexus.v1.broker.api.BrokerTrafficEvent (broker-service-api).
 * Use that type directly. Records cannot be extended; this type alias is kept only
 * to avoid breaking existing test imports during migration.
 */
@Deprecated(forRemoval = true)
public final class BrokerTrafficEvent {

    private final com.aibizarchitect.nexus.v1.broker.api.BrokerTrafficEvent delegate;

    public BrokerTrafficEvent(
            String eventId, String timestamp, long durationMs,
            String requestId, String service, String operation,
            boolean ok, int httpStatus, String source,
            com.aibizarchitect.nexus.v1.broker.api.ServiceRequest request,
            com.aibizarchitect.nexus.v1.broker.api.ServiceResponse<?> response,
            String errorMessage) {
        this.delegate = new com.aibizarchitect.nexus.v1.broker.api.BrokerTrafficEvent(
                eventId, timestamp, durationMs, requestId, service, operation,
                ok, httpStatus, source, request, response, errorMessage);
    }

    public com.aibizarchitect.nexus.v1.broker.api.BrokerTrafficEvent toApiEvent() {
        return delegate;
    }
}
