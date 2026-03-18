package com.angrysurfer.spring.nexus.controller;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.angrysurfer.spring.nexus.dto.ServiceStatus;
import com.angrysurfer.spring.nexus.dto.ServiceStatus.HealthState;
import com.angrysurfer.spring.nexus.entity.Deployment;
import com.angrysurfer.spring.nexus.repository.DeploymentRepository;
import com.angrysurfer.spring.nexus.service.ServiceStatusCacheService;

/**
 * REST controller for real-time service status data.
 * Provides fast, cached data for the 3D visualizer.
 * Falls back to live health checks when Redis is unavailable.
 */
@RestController
@RequestMapping("/api/v0/status")
@CrossOrigin(origins = "*")
@Deprecated(since = "v1", forRemoval = true)
public class ServiceStatusControllerV0 {

    private static final Logger log = LoggerFactory.getLogger(ServiceStatusControllerV0.class);

    private final ServiceStatusCacheService cacheService;
    private final DeploymentRepository deploymentRepository;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    public ServiceStatusControllerV0(ServiceStatusCacheService cacheService, DeploymentRepository deploymentRepository) {
        this.cacheService = cacheService;
        this.deploymentRepository = deploymentRepository;
    }

    /**
     * Get all service statuses.
     * First tries Redis cache, falls back to live health checks.
     */
    @GetMapping
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<List<ServiceStatus>> getAllStatuses() {
        List<ServiceStatus> statuses = cacheService.getAllServiceStatuses();

        // If Redis returned data, use it
        if (!statuses.isEmpty()) {
            return ResponseEntity.ok(statuses);
        }

        // Fallback: perform live health checks on deployments
        log.info("Redis unavailable or empty, performing live health checks...");
        statuses = performLiveHealthChecks();
        return ResponseEntity.ok(statuses);
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
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<ServiceStatus> getServiceStatus(@PathVariable String serviceName) {
        return cacheService.getServiceStatus(serviceName)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Get last heartbeat time for a service
     */
    @GetMapping("/{serviceName}/heartbeat")
    @Deprecated(since = "v1", forRemoval = true)
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
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<Map<String, Object>> getServiceMetrics(@PathVariable String serviceName) {
        return cacheService.getMetrics(serviceName)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Post metrics from a service
     */
    @PostMapping("/{serviceName}/metrics")
    @Deprecated(since = "v1", forRemoval = true)
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
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<Map<String, Object>> getRedisHealth() {
        boolean healthy = cacheService.isRedisHealthy();
        return ResponseEntity.ok(Map.of(
                "redisAvailable", healthy,
                "timestamp", Instant.now().toString()));
    }

    /**
     * Server-Sent Events endpoint for real-time updates.
     * The 3D visualizer can subscribe to this for live updates.
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Deprecated(since = "v1", forRemoval = true)
    public SseEmitter streamStatusUpdates() {
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);

        // TODO: Subscribe to Redis pub/sub and forward events to SSE
        // For now, return an emitter that will be managed by a listener

        log.info("New SSE client connected for status updates");

        emitter.onCompletion(() -> log.debug("SSE client disconnected"));
        emitter.onTimeout(() -> log.debug("SSE connection timed out"));
        emitter.onError(e -> log.warn("SSE error", e));

        return emitter;
    }
}
