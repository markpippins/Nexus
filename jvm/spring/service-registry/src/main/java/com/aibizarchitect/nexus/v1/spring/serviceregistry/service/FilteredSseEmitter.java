package com.aibizarchitect.nexus.v1.spring.serviceregistry.service;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * A filtering decorator around SseEmitter that only forwards events
 * matching the client's subscription criteria.
 *
 * Filters:
 *   - serviceNames: if non-empty, only events whose data contains a matching
 *     "serviceName" field are sent. Snapshot events are always sent.
 *   - eventTypes: if non-empty, only events whose type is in this set are sent.
 *     "snapshot" and "keepalive" are always sent regardless of this filter.
 *
 * Supports event IDs for Last-Event-Id reconnection. Each event sent
 * through this emitter is stamped with a monotonic ID.
 *
 * Tracks per-client metrics: events sent, events filtered, connected since.
 */
public class FilteredSseEmitter {

    private static final Logger log = LoggerFactory.getLogger(FilteredSseEmitter.class);

    private final SseEmitter delegate;
    private final Set<String> serviceNames;   // empty = all services
    private final Set<String> eventTypes;     // empty = all event types
    private final ObjectMapper objectMapper;

    // Per-client observability
    private final Instant connectedAt;
    private final AtomicLong eventsSent = new AtomicLong(0);
    private final AtomicLong eventsFiltered = new AtomicLong(0);

    public FilteredSseEmitter(SseEmitter delegate,
                              Set<String> serviceNames,
                              Set<String> eventTypes,
                              ObjectMapper objectMapper) {
        this.delegate = delegate;
        this.serviceNames = serviceNames != null ? serviceNames : Set.of();
        this.eventTypes = eventTypes != null ? eventTypes : Set.of();
        this.objectMapper = objectMapper;
        this.connectedAt = Instant.now();
    }

    /**
     * Attempt to send an event with a monotonic ID. Returns true if the event was sent,
     * false if it was filtered out.
     */
    public boolean send(String eventName, Object data, long eventId) {
        // Always send snapshot, keepalive
        if ("snapshot".equals(eventName) || "keepalive".equals(eventName)) {
            doSend(eventName, data, eventId);
            eventsSent.incrementAndGet();
            return true;
        }

        // Filter by event type
        if (!eventTypes.isEmpty() && !eventTypes.contains(eventName)) {
            eventsFiltered.incrementAndGet();
            return false;
        }

        // Filter by service name (extract from data)
        if (!serviceNames.isEmpty()) {
            String serviceName = extractServiceName(data);
            if (serviceName != null && !serviceNames.contains(serviceName)) {
                eventsFiltered.incrementAndGet();
                return false;
            }
        }

        doSend(eventName, data, eventId);
        eventsSent.incrementAndGet();
        return true;
    }

    /**
     * Attempt to send an event (backward-compatible, no ID).
     */
    public boolean send(String eventName, Object data) {
        return send(eventName, data, -1);
    }

    /**
     * Send an event with an ID. Snapshot and keepalive bypass filters.
     */
    private void doSend(String eventName, Object data, long eventId) {
        try {
            String json;
            if (data instanceof String) {
                json = (String) data;
            } else {
                json = objectMapper.writeValueAsString(data);
            }
            var builder = SseEmitter.event()
                    .name(eventName)
                    .data(json, org.springframework.http.MediaType.APPLICATION_JSON);

            // Add event ID if provided (skip for snapshot/keepalive)
            if (eventId > 0 && !"snapshot".equals(eventName) && !"keepalive".equals(eventName)) {
                builder.id(String.valueOf(eventId));
            }

            delegate.send(builder);
        } catch (IOException e) {
            log.debug("Failed to send SSE event {}: {}", eventName, e.getMessage());
            throw new RuntimeException(e);
        }
    }

    /**
     * Replay a buffered event to this client (for Last-Event-Id reconnection).
     * The event is sent with its original ID.
     */
    public void replayEvent(Map<String, Object> entry) {
        try {
            String eventType = String.valueOf(entry.get("type"));
            Object data = entry.get("data");
            Object idObj = entry.get("id");
            long eventId = idObj instanceof Number ? ((Number) idObj).longValue() : -1;

            String json;
            if (data instanceof String) {
                json = (String) data;
            } else {
                json = objectMapper.writeValueAsString(data);
            }

            var builder = SseEmitter.event()
                    .name(eventType)
                    .data(json, org.springframework.http.MediaType.APPLICATION_JSON);

            if (eventId > 0) {
                builder.id(String.valueOf(eventId));
            }

            delegate.send(builder);
            eventsSent.incrementAndGet();
        } catch (Exception e) {
            log.debug("Failed to replay event: {}", e.getMessage());
            throw new RuntimeException(e);
        }
    }

    /**
     * Try to extract serviceName from event data for filtering.
     */
    @SuppressWarnings("unchecked")
    private String extractServiceName(Object data) {
        if (data instanceof Map) {
            Object name = ((Map<String, Object>) data).get("serviceName");
            return name != null ? name.toString() : null;
        }
        if (data instanceof String) {
            try {
                Map<String, Object> map = objectMapper.readValue((String) data, Map.class);
                Object name = map.get("serviceName");
                return name != null ? name.toString() : null;
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }

    public SseEmitter getDelegate() {
        return delegate;
    }

    // --- Observability getters ---

    public Instant getConnectedAt() { return connectedAt; }
    public long getEventsSent() { return eventsSent.get(); }
    public long getEventsFiltered() { return eventsFiltered.get(); }
    public Set<String> getServiceFilter() { return serviceNames; }
    public Set<String> getEventFilter() { return eventTypes; }
}
