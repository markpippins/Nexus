package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.aibizarchitect.nexus.v1.dto.ServiceStatus;
import com.aibizarchitect.nexus.v1.dto.ServiceStatus.HealthState;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Deployment;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.DeploymentRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.StatusEventRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.service.FilteredSseEmitter;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.service.ServiceStatusCacheService;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.service.SseEmitterRegistry;

/**
 * REST controller for real-time service status data.
 * Provides fast, cached data for the 3D visualizer.
 * Falls back to live health checks when Redis is unavailable.
 */
@RestController
@RequestMapping("/api/v1/status")
public class ServiceStatusController {

    private static final Logger log = LoggerFactory.getLogger(ServiceStatusController.class);

    private final ServiceStatusCacheService cacheService;
    private final DeploymentRepository deploymentRepository;
    private final SseEmitterRegistry emitterRegistry;
    private final StatusEventRepository statusEventRepository;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    public ServiceStatusController(ServiceStatusCacheService cacheService,
            DeploymentRepository deploymentRepository,
            SseEmitterRegistry emitterRegistry,
            StatusEventRepository statusEventRepository,
            com.fasterxml.jackson.databind.ObjectMapper objectMapper) {
        this.cacheService = cacheService;
        this.deploymentRepository = deploymentRepository;
        this.emitterRegistry = emitterRegistry;
        this.statusEventRepository = statusEventRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * Get all service statuses.
     * First tries Redis cache, falls back to live health checks.
     */
    @GetMapping
    public ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<ServiceStatus>> getAllStatuses(org.springframework.data.domain.Pageable pageable) {
        List<ServiceStatus> statuses = cacheService.getAllServiceStatuses();

        // If Redis returned data, use it
        if (!statuses.isEmpty()) {
            int start = (int) pageable.getOffset();
            int end = Math.min((start + pageable.getPageSize()), statuses.size());
            org.springframework.data.domain.Page<ServiceStatus> page = new org.springframework.data.domain.PageImpl<>(
                    (start <= end) ? statuses.subList(start, end) : java.util.Collections.emptyList(),
                    pageable, statuses.size());
            return ResponseEntity.ok(com.aibizarchitect.nexus.v1.spring.serviceregistry.dto.SpringPagedResponse.fromPage(page));
        }

        // Fallback: perform live health checks on deployments
        log.info("Redis unavailable or empty, performing live health checks...");
        statuses = performLiveHealthChecks();
        int start = (int) pageable.getOffset();
        int end = Math.min((start + pageable.getPageSize()), statuses.size());
        org.springframework.data.domain.Page<ServiceStatus> page = new org.springframework.data.domain.PageImpl<>(
                (start <= end) ? statuses.subList(start, end) : java.util.Collections.emptyList(),
                pageable, statuses.size());
        return ResponseEntity.ok(com.aibizarchitect.nexus.v1.spring.serviceregistry.dto.SpringPagedResponse.fromPage(page));
    }

    /**
     * Perform live health checks on all deployments.
     */
    private List<ServiceStatus> performLiveHealthChecks() {
        List<ServiceStatus> statuses = new ArrayList<>();
        List<Deployment> deployments = deploymentRepository.findAll();

        List<CompletableFuture<ServiceStatus>> futures = new ArrayList<>();

        for (Deployment deployment : deployments) {
            String healthUrl = deployment.getHealthCheckUrl();
            String serviceName = deployment.getService() != null ? deployment.getService().getName() : "unknown";
            Long serviceId = deployment.getService() != null ? deployment.getService().getId() : null;

            // If no explicit healthCheckUrl, construct one from server and port
            if ((healthUrl == null || healthUrl.isEmpty()) && deployment.getServer() != null
                    && deployment.getPort() != null) {
                String hostname = deployment.getServer().getHostname();
                if (hostname == null || hostname.isEmpty()) {
                    hostname = deployment.getServer().getIpAddress();
                }
                if (hostname != null && !hostname.isEmpty()) {
                    // Try standard health endpoints: /health, /actuator/health, /q/health
                    healthUrl = String.format("http://%s:%d/health", hostname, deployment.getPort());
                }
            }

            if (healthUrl != null && !healthUrl.isEmpty()) {
                CompletableFuture<ServiceStatus> future = checkHealthAsync(serviceId, serviceName, healthUrl);
                futures.add(future);
            } else {
                // No health URL - create unknown status
                statuses.add(ServiceStatus.builder()
                        .serviceId(serviceId)
                        .serviceName(serviceName)
                        .healthState(HealthState.UNKNOWN)
                        .lastHealthCheck(Instant.now())
                        .build());
            }
        }

        // Wait for all health checks (with timeout)
        try {
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                    .get(10, TimeUnit.SECONDS);

            for (CompletableFuture<ServiceStatus> future : futures) {
                statuses.add(future.get());
            }
        } catch (Exception e) {
            log.warn("Some health checks timed out: {}", e.getMessage());
            // Add any completed futures
            for (CompletableFuture<ServiceStatus> future : futures) {
                if (future.isDone() && !future.isCompletedExceptionally()) {
                    try {
                        statuses.add(future.get());
                    } catch (Exception ex) {
                        // ignore
                    }
                }
            }
        }

        return statuses;
    }

    /**
     * Asynchronously check health of a service endpoint.
     */
    private CompletableFuture<ServiceStatus> checkHealthAsync(Long serviceId, String serviceName, String healthUrl) {
        return CompletableFuture.supplyAsync(() -> {
            Instant checkTime = Instant.now();
            try {
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(healthUrl))
                        .timeout(Duration.ofSeconds(3))
                        .GET()
                        .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

                HealthState state = response.statusCode() >= 200 && response.statusCode() < 300
                        ? HealthState.HEALTHY
                        : HealthState.UNHEALTHY;

                return ServiceStatus.builder()
                        .serviceId(serviceId)
                        .serviceName(serviceName)
                        .healthState(state)
                        .lastHealthCheck(checkTime)
                        .responseTimeMs(Duration.between(checkTime, Instant.now()).toMillis())
                        .build();
            } catch (Exception e) {
                log.debug("Health check failed for {}: {}", serviceName, e.getMessage());
                return ServiceStatus.builder()
                        .serviceId(serviceId)
                        .serviceName(serviceName)
                        .healthState(HealthState.UNHEALTHY)
                        .lastHealthCheck(checkTime)
                        .errorMessage(e.getMessage())
                        .build();
            }
        });
    }

    /**
     * Get status for a specific service
     */
    @GetMapping("/{serviceName}")
    public ResponseEntity<ServiceStatus> getServiceStatus(@PathVariable String serviceName) {
        return cacheService.getServiceStatus(serviceName)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Get last heartbeat time for a service
     */
    @GetMapping("/{serviceName}/heartbeat")
    public ResponseEntity<Map<String, Object>> getLastHeartbeat(@PathVariable String serviceName) {
        Optional<Instant> lastHeartbeat = cacheService.getLastHeartbeat(serviceName);

        if (lastHeartbeat.isPresent()) {
            return ResponseEntity.ok(Map.of(
                    "serviceName", serviceName,
                    "lastHeartbeat", lastHeartbeat.get().toString(),
                    "isStale", cacheService.isServiceStale(serviceName)));
        }

        return ResponseEntity.notFound().build();
    }

    /**
     * Get metrics for a specific service
     */
    @GetMapping("/{serviceName}/metrics")
    public ResponseEntity<Map<String, Object>> getServiceMetrics(@PathVariable String serviceName) {
        return cacheService.getMetrics(serviceName)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Post metrics from a service
     */
    @PostMapping("/{serviceName}/metrics")
    public ResponseEntity<Map<String, String>> postServiceMetrics(
            @PathVariable String serviceName,
            @RequestBody Map<String, Object> metrics) {
        cacheService.storeMetrics(serviceName, metrics);
        return ResponseEntity.ok(Map.of(
                "message", "Metrics stored",
                "serviceName", serviceName));
    }

    /**
     * Get Redis health status
     */
    @GetMapping("/health/redis")
    public ResponseEntity<Map<String, Object>> getRedisHealth() {
        boolean healthy = cacheService.isRedisHealthy();
        return ResponseEntity.ok(Map.of(
                "redisAvailable", healthy,
                "timestamp", Instant.now().toString()));
    }

    /**
     * Server-Sent Events endpoint for real-time updates.
     * Clients subscribe here and receive status updates, heartbeat events,
     * and status-change (transition) events as they are published to Redis
     * pub/sub by ServiceStatusCacheService.
     *
     * On connect, a "snapshot" event is immediately sent with all current
     * service statuses so the client has full context without waiting.
     *
     * Query parameters for filtering:
     *   ?services=conduit-mcp,nebula-srv   — only events for these services
     *   ?events=status-update,heartbeat    — only these event types
     *
     * Events:
     *   - "snapshot"      — initial state dump (always sent, not filterable)
     *   - "status-update" — service health state changed
     *   - "heartbeat"     — service sent a heartbeat
     *   - "status-change" — service transitioned between states (HEALTHY→OFFLINE etc.)
     *   - "keepalive"     — periodic empty event to prevent proxy timeouts
     *
     * Try it:
     *   curl -N http://localhost:8085/api/v1/status/stream
     *   curl -N "http://localhost:8085/api/v1/status/stream?services=conduit-mcp&events=status-update,status-change"
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamStatusUpdates(
            @org.springframework.web.bind.annotation.RequestParam(required = false) String services,
            @org.springframework.web.bind.annotation.RequestParam(required = false) String events) {

        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);

        // Parse filter params
        Set<String> serviceNames = parseCommaSeparated(services);
        Set<String> eventTypes = parseCommaSeparated(events);

        // Register with filters — events flow via RedisSseBridge
        emitterRegistry.register(emitter, serviceNames, eventTypes);

        // Build and send snapshot immediately
        sendSnapshot(emitter, serviceNames);

        log.info("SSE client connected for status updates (total: {})", emitterRegistry.getClientCount());

        return emitter;
    }

    /**
     * Get status transition history for a service.
     *
     *   GET /api/v1/status/{serviceName}/history
     *   GET /api/v1/status/{serviceName}/history?limit=20
     */
    @GetMapping("/{serviceName}/history")
    public ResponseEntity<List<Map<String, Object>>> getStatusHistory(
            @PathVariable String serviceName,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "50") int limit) {

        List<com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.StatusEvent> events =
                statusEventRepository.findRecentByServiceName(serviceName, limit);

        List<Map<String, Object>> result = events.stream().map(e -> {
            var map = new java.util.LinkedHashMap<String, Object>();
            map.put("serviceName", e.getServiceName());
            map.put("oldState", e.getOldState());
            map.put("newState", e.getNewState());
            map.put("reason", e.getReason());
            map.put("errorMessage", e.getErrorMessage());
            map.put("changedAt", e.getChangedAt() != null ? e.getChangedAt().toString() : null);
            return map;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    /**
     * Get recent status transitions across all services.
     *
     *   GET /api/v1/status/transitions
     *   GET /api/v1/status/transitions?limit=20
     */
    @GetMapping("/transitions")
    public ResponseEntity<List<Map<String, Object>>> getRecentTransitions(
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "50") int limit) {

        List<com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.StatusEvent> events =
                statusEventRepository.findRecentGlobal(limit);

        List<Map<String, Object>> result = events.stream().map(e -> {
            var map = new java.util.LinkedHashMap<String, Object>();
            map.put("serviceName", e.getServiceName());
            map.put("oldState", e.getOldState());
            map.put("newState", e.getNewState());
            map.put("reason", e.getReason());
            map.put("changedAt", e.getChangedAt() != null ? e.getChangedAt().toString() : null);
            return map;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    /**
     * Get information about all connected SSE clients.
     *
     *   GET /api/v1/status/stream/clients
     *
     * Returns: { count, clients: [{connectedAt, eventsSent, eventsFiltered, serviceFilter, eventFilter}] }
     */
    @GetMapping("/stream/clients")
    public ResponseEntity<Map<String, Object>> getSseClients() {
        List<Map<String, Object>> clients = emitterRegistry.getClientInfo();
        return ResponseEntity.ok(Map.of(
                "count", clients.size(),
                "clients", clients));
    }

    /**
     * Build and send a snapshot event to a newly connected client.
     * Contains all current service statuses from Redis cache.
     */
    private void sendSnapshot(SseEmitter rawEmitter, Set<String> serviceNames) {
        try {
            List<ServiceStatus> allStatuses = cacheService.getSnapshotStatuses();

            // Filter by requested services if specified
            List<ServiceStatus> snapshot;
            if (serviceNames != null && !serviceNames.isEmpty()) {
                snapshot = allStatuses.stream()
                        .filter(s -> s.getServiceName() != null && serviceNames.contains(s.getServiceName()))
                        .collect(Collectors.toList());
            } else {
                snapshot = allStatuses;
            }

            Map<String, Object> snapshotEvent = Map.of(
                    "services", snapshot,
                    "count", snapshot.size(),
                    "timestamp", Instant.now().toString());

            rawEmitter.send(SseEmitter.event()
                    .name("snapshot")
                    .data(objectMapper.writeValueAsString(snapshotEvent),
                            org.springframework.http.MediaType.APPLICATION_JSON));

            log.debug("Sent snapshot with {} services to new SSE client", snapshot.size());
        } catch (Exception e) {
            log.warn("Failed to send snapshot to SSE client: {}", e.getMessage());
        }
    }

    /**
     * Parse a comma-separated query param into a trimmed, lowercased set.
     * Returns empty set if input is null or blank.
     */
    private Set<String> parseCommaSeparated(String input) {
        if (input == null || input.isBlank()) {
            return Set.of();
        }
        return Arrays.stream(input.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toSet());
    }
}
