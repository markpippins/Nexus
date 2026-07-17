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
 * Supports Last-Event-Id reconnection via {@link SseEventBuffer}. When a
 * client reconnects with a Last-Event-Id header, all events since that ID
 * are replayed before the client joins the live broadcast.
 *
 * Usage:
 *   1. Controller adds emitter via {@link #register(SseEmitter, Set, Set, Long)}
 *   2. Redis bridge calls {@link #broadcastStatus(Map)} or {@link #broadcastHeartbeat(Map)}
 *   3. Dead emitters are auto-removed on send failure
 */
@Component
public class SseEmitterRegistry {

    private static final Logger log = LoggerFactory.getLogger(SseEmitterRegistry.class);

    private final List<FilteredSseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final ObjectMapper objectMapper;
    private final SseEventBuffer eventBuffer;

    public SseEmitterRegistry(ObjectMapper objectMapper, SseEventBuffer eventBuffer) {
        this.objectMapper = objectMapper;
        this.eventBuffer = eventBuffer;
    }

    /**
     * Register a new SSE client with optional filters.
     *
     * @param emitter       The raw SseEmitter from Spring
     * @param serviceNames  If non-empty, only events for these services are sent
     * @param eventTypes    If non-empty, only these event types are sent
     * @param lastEventId   If non-null, replay events after this ID before joining live
     */
    public void register(SseEmitter emitter, Set<String> serviceNames, Set<String> eventTypes, Long lastEventId) {
        FilteredSseEmitter filtered = new FilteredSseEmitter(emitter, serviceNames, eventTypes, objectMapper);
        emitters.add(filtered);

        String filterDesc = describeFilters(serviceNames, eventTypes);
        log.info("SSE client connected{} (total: {})", filterDesc, emitters.size());

        // Replay missed events if Last-Event-Id was provided
        if (lastEventId != null && lastEventId > 0) {
            replayEvents(filtered, lastEventId, serviceNames);
        }

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
     * Register with no replay (backward-compatible).
     */
    public void register(SseEmitter emitter, Set<String> serviceNames, Set<String> eventTypes) {
        register(emitter, serviceNames, eventTypes, null);
    }

    /**
     * Register with no filters and no replay.
     */
    public void register(SseEmitter emitter) {
        register(emitter, Set.of(), Set.of(), null);
    }

    /**
     * Broadcast a service status update to all connected clients.
     * Event type: "status-update"
     */
    public void broadcastStatus(Map<String, Object> statusData) {
        broadcastWithBuffer("status-update", statusData, extractServices(statusData));
    }

    /**
     * Broadcast a heartbeat event to all connected clients.
     * Event type: "heartbeat"
     */
    public void broadcastHeartbeat(Map<String, Object> heartbeatData) {
        broadcastWithBuffer("heartbeat", heartbeatData, extractServices(heartbeatData));
    }

    /**
     * Broadcast a status-change (transition) event to all connected clients.
     * Event type: "status-change"
     */
    public void broadcastStatusChange(Map<String, Object> changeData) {
        broadcastWithBuffer("status-change", changeData, extractServices(changeData));
    }

    /**
     * Broadcast a cascade (pipeline) event to all connected clients.
     * Event type: "cascade"
     */
    public void broadcastCascade(Map<String, Object> cascadeData) {
        broadcastWithBuffer("cascade", cascadeData, Set.of());
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
        }
    }

    /**
     * Broadcast a generic event to all connected clients.
     * Events are stored in the buffer with IDs for Last-Event-Id reconnection.
     */
    public void broadcast(String eventName, Object data) {
        broadcastWithBuffer(eventName, data, Set.of());
    }

    /**
     * Broadcast an event, store it in the buffer, and deliver to all clients.
     */
    private void broadcastWithBuffer(String eventName, Object data, Set<String> services) {
        // Allocate event ID and store in buffer even if no clients connected
        // (clients connecting later with Last-Event-Id need these events)
        long eventId = eventBuffer.nextEventId();
        eventBuffer.append(eventId, eventName, data, services);

        if (emitters.isEmpty()) {
            return;
        }

        List<FilteredSseEmitter> deadEmitters = new ArrayList<>();

        for (FilteredSseEmitter emitter : emitters) {
            try {
                emitter.send(eventName, data, eventId);
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

        List<FilteredSseEmitter> deadEmitters = new ArrayList<>();

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
     * Get the latest event ID from the buffer (for observability).
     */
    public long getLatestEventId() {
        return eventBuffer.getCurrentEventId();
    }

    /**
     * Get observability info about all connected SSE clients.
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

    /**
     * Replay buffered events to a reconnecting client.
     */
    private void replayEvents(FilteredSseEmitter client, long lastEventId, Set<String> serviceFilter) {
        List<Map<String, Object>> events = eventBuffer.getEventsSince(lastEventId);
        if (events.isEmpty()) {
            log.debug("No events to replay since ID {}", lastEventId);
            return;
        }

        int replayed = 0;
        for (Map<String, Object> entry : events) {
            try {
                // Apply service filter during replay
                if (serviceFilter != null && !serviceFilter.isEmpty()) {
                    Object servicesObj = entry.get("services");
                    if (servicesObj instanceof Set) {
                        @SuppressWarnings("unchecked")
                        Set<String> eventServices = (Set<String>) servicesObj;
                        if (!eventServices.isEmpty() && eventServices.stream().noneMatch(serviceFilter::contains)) {
                            continue;
                        }
                    }
                }
                client.replayEvent(entry);
                replayed++;
            } catch (Exception e) {
                log.debug("Failed to replay event during reconnect: {}", e.getMessage());
                break; // Stop replay on error
            }
        }

        log.info("Replayed {} events to reconnecting client (since ID {})", replayed, lastEventId);
    }

    /**
     * Extract service names from event data for buffer indexing.
     */
    @SuppressWarnings("unchecked")
    private Set<String> extractServices(Object data) {
        if (data instanceof Map) {
            Object name = ((Map<String, Object>) data).get("serviceName");
            if (name != null) {
                return Set.of(name.toString());
            }
        }
        return Set.of();
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
