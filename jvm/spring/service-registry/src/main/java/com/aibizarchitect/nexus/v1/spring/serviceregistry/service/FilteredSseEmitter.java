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
     * Attempt to send an event. Returns true if the event was sent,
     * false if it was filtered out.
     */
    public boolean send(String eventName, Object data) {
        // Always send snapshot, keepalive
        if ("snapshot".equals(eventName) || "keepalive".equals(eventName)) {
            doSend(eventName, data);
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

        doSend(eventName, data);
        eventsSent.incrementAndGet();
        return true;
    }

    private void doSend(String eventName, Object data) {
        try {
            String json;
            if (data instanceof String) {
                json = (String) data;
            } else {
                json = objectMapper.writeValueAsString(data);
            }
            delegate.send(SseEmitter.event()
                    .name(eventName)
                    .data(json, org.springframework.http.MediaType.APPLICATION_JSON));
        } catch (IOException e) {
            log.debug("Failed to send SSE event {}: {}", eventName, e.getMessage());
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
            // JSON string — parse minimally
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
