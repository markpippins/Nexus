package com.aibizarchitect.nexus.v1.spring.broker.gateway;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.aibizarchitect.nexus.v1.broker.api.BrokerTrafficEvent;
import com.aibizarchitect.nexus.v1.broker.api.BrokerTrafficPublisher;

import jakarta.annotation.PreDestroy;

@Component
public class BrokerTrafficStreamService implements BrokerTrafficPublisher {

    private static final Logger log = LoggerFactory.getLogger(BrokerTrafficStreamService.class);
    private static final long SSE_TIMEOUT_MS = 0L;
    private static final long HEARTBEAT_INTERVAL_SECONDS = 15L;

    private final ConcurrentMap<UUID, SseEmitter> emitters = new ConcurrentHashMap<>();
    private final ScheduledExecutorService heartbeatExecutor = Executors.newSingleThreadScheduledExecutor(
            new DaemonThreadFactory());

    public BrokerTrafficStreamService() {
        heartbeatExecutor.scheduleAtFixedRate(this::sendHeartbeatSafely,
                HEARTBEAT_INTERVAL_SECONDS,
                HEARTBEAT_INTERVAL_SECONDS,
                TimeUnit.SECONDS);
        log.info("BrokerTrafficStreamService initialized");
    }

    public SseEmitter subscribe() {
        UUID emitterId = UUID.randomUUID();
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        emitters.put(emitterId, emitter);

        emitter.onCompletion(() -> removeEmitter(emitterId));
        emitter.onTimeout(() -> {
            emitter.complete();
            removeEmitter(emitterId);
        });
        emitter.onError(error -> {
            log.debug("Broker traffic SSE emitter error: {}", error.getMessage());
            emitter.complete();
            removeEmitter(emitterId);
        });

        try {
            emitter.send(SseEmitter.event()
                    .name("connected")
                    .data(Map.of("timestamp", Instant.now().toString()), MediaType.APPLICATION_JSON));
        } catch (IOException e) {
            removeEmitter(emitterId);
            emitter.completeWithError(e);
        }

        return emitter;
    }

    @Override
    public void publish(BrokerTrafficEvent event) {
        emitters.forEach((id, emitter) -> {
            try {
                emitter.send(SseEmitter.event()
                        .id(event.eventId())
                        .name("broker-traffic")
                        .data(event, MediaType.APPLICATION_JSON));
            } catch (IOException | IllegalStateException e) {
                log.debug("Removing failed broker traffic SSE emitter: {}", e.getMessage());
                removeEmitter(id);
                emitter.complete();
            }
        });
    }

    int subscriberCount() {
        return emitters.size();
    }

    void sendHeartbeat() {
        emitters.forEach((id, emitter) -> {
            try {
                emitter.send(SseEmitter.event()
                        .name("ping")
                        .data(Map.of("timestamp", Instant.now().toString()), MediaType.APPLICATION_JSON));
            } catch (IOException | IllegalStateException e) {
                log.debug("Removing heartbeat-failed broker traffic SSE emitter: {}", e.getMessage());
                removeEmitter(id);
                emitter.complete();
            }
        });
    }

    private void sendHeartbeatSafely() {
        try {
            sendHeartbeat();
        } catch (Exception e) {
            log.warn("Heartbeat dispatch failed: {}", e.getMessage(), e);
        }
    }

    private void removeEmitter(UUID emitterId) {
        emitters.remove(emitterId);
    }

    @PreDestroy
    public void shutdown() {
        heartbeatExecutor.shutdownNow();
        emitters.forEach((id, emitter) -> emitter.complete());
        emitters.clear();
    }

    private static final class DaemonThreadFactory implements ThreadFactory {
        @Override
        public Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable, "broker-traffic-heartbeat");
            thread.setDaemon(true);
            return thread;
        }
    }
}
