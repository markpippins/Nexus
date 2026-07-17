package com.aibizarchitect.nexus.v1.spring.serviceregistry.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Redis-backed circular buffer for SSE events.
 *
 * Stores the last {@link #MAX_EVENTS} events in a Redis list keyed by
 * "sse:event-buffer". Each entry is a JSON string: {"id":N,"type":"...","data":{...}}.
 *
 * A separate counter "sse:event-counter" provides monotonic event IDs.
 *
 * On reconnect, clients pass the Last-Event-Id header and we replay all
 * events with ID > that value (up to MAX_EVENTS).
 */
@Component
public class SseEventBuffer {

    private static final Logger log = LoggerFactory.getLogger(SseEventBuffer.class);

    private static final String BUFFER_KEY = "sse:event-buffer";
    private static final String COUNTER_KEY = "sse:event-counter";
    private static final int MAX_EVENTS = 1000;

    private final StringRedisTemplate redis;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    public SseEventBuffer(StringRedisTemplate redis, com.fasterxml.jackson.databind.ObjectMapper objectMapper) {
        this.redis = redis;
        this.objectMapper = objectMapper;
    }

    /**
     * Allocate the next event ID (monotonic counter).
     */
    public long nextEventId() {
        Long id = redis.opsForValue().increment(COUNTER_KEY);
        return id != null ? id : 1L;
    }

    /**
     * Append an event to the circular buffer.
     *
     * @param eventId   Monotonic ID from {@link #nextEventId()}
     * @param eventType SSE event name (e.g., "status-update")
     * @param data      Event payload (Map or String)
     * @param services  Service names this event relates to (for filtered replay)
     */
    public void append(long eventId, String eventType, Object data, Set<String> services) {
        try {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("id", eventId);
            entry.put("type", eventType);
            entry.put("data", data);
            entry.put("services", services != null ? services : Set.of());

            String json = objectMapper.writeValueAsString(entry);
            redis.opsForList().leftPush(BUFFER_KEY, json);

            // Trim to MAX_EVENTS
            redis.opsForList().trim(BUFFER_KEY, 0, MAX_EVENTS - 1);
        } catch (Exception e) {
            log.warn("Failed to append event to buffer: {}", e.getMessage());
        }
    }

    /**
     * Get all events with ID > lastEventId (for replay on reconnect).
     * Returns events in chronological order (oldest first).
     */
    public List<Map<String, Object>> getEventsSince(long lastEventId) {
        List<Map<String, Object>> result = new ArrayList<>();
        try {
            // Read the entire buffer (newest first) and filter
            List<String> entries = redis.opsForList().range(BUFFER_KEY, 0, -1);
            if (entries == null || entries.isEmpty()) {
                return result;
            }

            // Buffer is newest-first, we want oldest-first for replay
            for (int i = entries.size() - 1; i >= 0; i--) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> entry = objectMapper.readValue(entries.get(i), Map.class);
                    Long id = entry.get("id") instanceof Number
                            ? ((Number) entry.get("id")).longValue()
                            : null;
                    if (id != null && id > lastEventId) {
                        result.add(entry);
                    }
                } catch (Exception e) {
                    // Skip malformed entries
                }
            }
        } catch (Exception e) {
            log.warn("Failed to read event buffer: {}", e.getMessage());
        }
        return result;
    }

    /**
     * Get the current event counter value (latest event ID).
     */
    public long getCurrentEventId() {
        String val = redis.opsForValue().get(COUNTER_KEY);
        return val != null ? Long.parseLong(val) : 0L;
    }
}
