package com.aibizarchitect.nexus.v1.spring.serviceregistry.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Thread-safe registry of connected SSE clients.
 * Broadcasts service status updates and heartbeat events to all subscribers.
 *
 * Supports filtered registrations: each client can subscribe to specific
 * services and/or event types via query parameters. Snapshot and keepalive
 * events are always delivered regardless of filters.
 *
 * Usage:
 *   1. Controller adds emitter via {@link #register(SseEmitter, Set, Set)}
 *   2. Redis bridge calls {@link #broadcastStatus(Map)} or {@link #broadcastHeartbeat(Map)}
 *   3. Dead emitters are auto-removed on send failure
 */
@Component
public class SseEmitterRegistry {

    private static final Logger log = LoggerFactory.getLogger(SseEmitterRegistry.class);

    private final List<FilteredSseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final ObjectMapper objectMapper;

    public SseEmitterRegistry(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * Register a new SSE client with optional filters.
     *
     * @param emitter       The raw SseEmitter from Spring
     * @param serviceNames  If non-empty, only events for these services are sent
     * @param eventTypes    If non-empty, only these event types are sent
     */
    public void register(SseEmitter emitter, Set<String> serviceNames, Set<String> eventTypes) {
        FilteredSseEmitter filtered = new FilteredSseEmitter(emitter, serviceNames, eventTypes, objectMapper);
        emitters.add(filtered);

        String filterDesc = describeFilters(serviceNames, eventTypes);
        log.info("SSE client connected{} (total: {})", filterDesc, emitters.size());

        emitter.onCompletion(() -> {
            emitters.remove(filtered);
            log.debug("SSE client disconnected (total: {})", emitters.size());
        });

        emitter.onTimeout(() -> {
            emitters.remove(filtered);
            log.debug("SSE client timed out (total: {})", emitters.size());
        });

        emitter.onError(e -> {
            emitters.remove(filtered);
            log.warn("SSE client error: {} (total: {})", e.getMessage(), emitters.size());
        });
    }

    /**
     * Register a new SSE client with no filters (receives everything).
     */
    public void register(SseEmitter emitter) {
        register(emitter, Set.of(), Set.of());
    }

    /**
     * Broadcast a service status update to all connected clients.
     * Event type: "status-update"
     */
    public void broadcastStatus(Map<String, Object> statusData) {
        broadcast("status-update", statusData);
    }

    /**
     * Broadcast a heartbeat event to all connected clients.
     * Event type: "heartbeat"
     */
    public void broadcastHeartbeat(Map<String, Object> heartbeatData) {
        broadcast("heartbeat", heartbeatData);
    }

    /**
     * Broadcast a status-change (transition) event to all connected clients.
     * Event type: "status-change"
     */
    public void broadcastStatusChange(Map<String, Object> changeData) {
        broadcast("status-change", changeData);
    }

    /**
     * Broadcast a snapshot event (all current statuses) to a single client.
     * Used on connection to provide immediate context.
     */
    public void sendSnapshot(FilteredSseEmitter client, Object snapshotData) {
        try {
            client.send("snapshot", snapshotData);
        } catch (Exception e) {
            log.debug("Failed to send snapshot to client: {}", e.getMessage());
            // Client will be cleaned up by the error handler
        }
    }

    /**
     * Broadcast a generic event to all connected clients.
     */
    public void broadcast(String eventName, Object data) {
        if (emitters.isEmpty()) {
            return;
        }

        List<FilteredSseEmitter> deadEmitters = new java.util.ArrayList<>();

        for (FilteredSseEmitter emitter : emitters) {
            try {
                emitter.send(eventName, data);
            } catch (Exception e) {
                deadEmitters.add(emitter);
            }
        }

        // Clean up dead emitters
        emitters.removeAll(deadEmitters);
        if (!deadEmitters.isEmpty()) {
            log.debug("Cleaned up {} dead SSE emitters (remaining: {})", deadEmitters.size(), emitters.size());
        }
    }

    /**
     * Send a keepalive comment to all connected clients.
     * Prevents proxy/load-balancer timeouts on idle connections.
     */
    public void sendKeepalive() {
        if (emitters.isEmpty()) {
            return;
        }

        List<FilteredSseEmitter> deadEmitters = new java.util.ArrayList<>();

        for (FilteredSseEmitter emitter : emitters) {
            try {
                emitter.send("keepalive", "");
            } catch (Exception e) {
                deadEmitters.add(emitter);
            }
        }

        emitters.removeAll(deadEmitters);
    }

    /**
     * Get the number of connected SSE clients.
     */
    public int getClientCount() {
        return emitters.size();
    }

    /**
     * Get observability info about all connected SSE clients.
     * Returns a list of maps with: connectedAt, eventsSent, eventsFiltered,
     * serviceFilter, eventFilter.
     */
    public List<Map<String, Object>> getClientInfo() {
        List<Map<String, Object>> info = new ArrayList<>();
        for (FilteredSseEmitter emitter : emitters) {
            info.add(Map.of(
                    "connectedAt", emitter.getConnectedAt().toString(),
                    "eventsSent", emitter.getEventsSent(),
                    "eventsFiltered", emitter.getEventsFiltered(),
                    "serviceFilter", emitter.getServiceFilter().isEmpty()
                            ? "all" : emitter.getServiceFilter(),
                    "eventFilter", emitter.getEventFilter().isEmpty()
                            ? "all" : emitter.getEventFilter()));
        }
        return info;
    }

    private String describeFilters(Set<String> serviceNames, Set<String> eventTypes) {
        if ((serviceNames == null || serviceNames.isEmpty()) &&
            (eventTypes == null || eventTypes.isEmpty())) {
            return "";
        }
        StringBuilder sb = new StringBuilder(" [filters:");
        if (serviceNames != null && !serviceNames.isEmpty()) {
            sb.append(" services=").append(serviceNames);
        }
        if (eventTypes != null && !eventTypes.isEmpty()) {
            sb.append(" events=").append(eventTypes);
        }
        sb.append("]");
        return sb.toString();
    }
}
