package com.aibizarchitect.nexus.v1.spring.serviceregistry.service;

import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import org.springframework.stereotype.Component;

/**
 * Redis pub/sub listener that bridges status updates and heartbeat events
 * to connected SSE clients.
 *
 * Subscribes to two channels:
 *   - "service-status-updates" → broadcasts as SSE "status-update" event
 *   - "service-heartbeats"     → broadcasts as SSE "heartbeat" event
 *
 * Also handles stale detection transitions by checking if a service went OFFLINE
 * and emitting a separate "status-change" event.
 */
@Component
public class RedisSseBridge implements MessageListener {

    private static final Logger log = LoggerFactory.getLogger(RedisSseBridge.class);

    public static final String STATUS_CHANNEL = "service-status-updates";
    public static final String HEARTBEAT_CHANNEL = "service-heartbeats";
    public static final String STATUS_CHANGE_CHANNEL = "service-status-changes";
    public static final String CASCADE_CHANNEL = "cascade-events";

    private final SseEmitterRegistry emitterRegistry;
    private final StringRedisSerializer stringSerializer = new StringRedisSerializer();
    private final com.fasterxml.jackson.databind.ObjectMapper plainMapper;

    public RedisSseBridge(SseEmitterRegistry emitterRegistry, com.fasterxml.jackson.databind.ObjectMapper objectMapper) {
        this.emitterRegistry = emitterRegistry;
        this.plainMapper = objectMapper;
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String channel = new String(message.getChannel());
            byte[] body = message.getBody();

            if (STATUS_CHANNEL.equals(channel)) {
                handleStatusUpdate(body);
            } else if (HEARTBEAT_CHANNEL.equals(channel)) {
                handleHeartbeat(body);
            } else if (STATUS_CHANGE_CHANNEL.equals(channel)) {
                handleStatusChange(body);
            } else if (CASCADE_CHANNEL.equals(channel)) {
                handleCascadeEvent(body);
            } else {
                log.debug("Received message on unknown channel: {}", channel);
            }
        } catch (Exception e) {
            log.warn("Error processing Redis message: {}", e.getMessage());
        }
    }

    private void handleStatusUpdate(byte[] body) {
        try {
            String json = stringSerializer.deserialize(body);
            @SuppressWarnings("unchecked")
            Map<String, Object> eventData = plainMapper.readValue(json, Map.class);

            // Ensure we have a service name for routing
            String serviceName = eventData.containsKey("serviceName")
                    ? String.valueOf(eventData.get("serviceName"))
                    : "unknown";

            log.debug("Bridging status update for {}: {}", serviceName,
                    eventData.getOrDefault("healthState", "unknown"));

            emitterRegistry.broadcastStatus(eventData);

        } catch (Exception e) {
            log.warn("Error handling status update: {}", e.getMessage());
        }
    }

    private void handleHeartbeat(byte[] body) {
        try {
            String json = stringSerializer.deserialize(body);
            @SuppressWarnings("unchecked")
            Map<String, Object> eventData = plainMapper.readValue(json, Map.class);

            String serviceName = eventData.containsKey("serviceName")
                    ? String.valueOf(eventData.get("serviceName"))
                    : "unknown";

            log.debug("Bridging heartbeat for {}", serviceName);

            emitterRegistry.broadcastHeartbeat(eventData);

        } catch (Exception e) {
            log.warn("Error handling heartbeat: {}", e.getMessage());
        }
    }

    private void handleStatusChange(byte[] body) {
        try {
            String json = stringSerializer.deserialize(body);
            @SuppressWarnings("unchecked")
            Map<String, Object> eventData = plainMapper.readValue(json, Map.class);

            String serviceName = eventData.containsKey("serviceName")
                    ? String.valueOf(eventData.get("serviceName"))
                    : "unknown";

            log.info("Bridging status-change for {}: {} → {}", serviceName,
                    eventData.get("oldState"), eventData.get("newState"));

            emitterRegistry.broadcastStatusChange(eventData);

        } catch (Exception e) {
            log.warn("Error handling status-change: {}", e.getMessage());
        }
    }

    private void handleCascadeEvent(byte[] body) {
        try {
            String json = stringSerializer.deserialize(body);
            @SuppressWarnings("unchecked")
            Map<String, Object> eventData = plainMapper.readValue(json, Map.class);

            log.debug("Bridging cascade event: {}", eventData.get("type"));

            emitterRegistry.broadcastCascade(eventData);

        } catch (Exception e) {
            log.warn("Error handling cascade event: {}", e.getMessage());
        }
    }
}
