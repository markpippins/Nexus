package com.aibizarchitect.nexus.v1.spring.serviceregistry.service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.dto.ServiceStatus;
import com.aibizarchitect.nexus.v1.dto.ServiceStatus.HealthState;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Service for managing real-time service status in Redis.
 * Provides caching and pub/sub capabilities for the 3D visualizer.
 */
@Service
public class ServiceStatusCacheService {

    private static final Logger log = LoggerFactory.getLogger(ServiceStatusCacheService.class);

    // Redis key prefixes
    private static final String STATUS_KEY_PREFIX = "service:status:";
    private static final String HEARTBEAT_KEY_PREFIX = "service:heartbeat:";
    private static final String METRICS_KEY_PREFIX = "service:metrics:";
    private static final String MAINTENANCE_KEY_PREFIX = "service:maintenance:";
    private static final String ALL_SERVICES_KEY = "services:active";

    // Pub/Sub channels
    public static final String SERVICE_STATUS_CHANNEL = "service-status-updates";
    public static final String HEARTBEAT_CHANNEL = "service-heartbeats";
    public static final String STATUS_CHANGE_CHANNEL = "service-status-changes";

    // TTL values
    private static final long STATUS_TTL_SECONDS = 300; // 5 minutes
    private static final long HEARTBEAT_TTL_SECONDS = 60; // 1 minute
    private static final long METRICS_TTL_SECONDS = 120; // 2 minutes

    // Stale threshold
    private static final long STALE_THRESHOLD_SECONDS = 90;

    private final RedisTemplate<String, Object> redisTemplate;
    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;
    private final com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.StatusEventRepository statusEventRepository;

    // Flag to track Redis availability
    private volatile boolean redisAvailable = true;

    public ServiceStatusCacheService(@Nullable RedisTemplate<String, Object> redisTemplate,
            @Nullable StringRedisTemplate stringRedisTemplate,
            ObjectMapper objectMapper,
            @Nullable com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.StatusEventRepository statusEventRepository) {
        this.redisTemplate = redisTemplate;
        this.stringRedisTemplate = stringRedisTemplate;
        this.objectMapper = objectMapper;
        this.statusEventRepository = statusEventRepository;
        if (redisTemplate == null || stringRedisTemplate == null) {
            redisAvailable = false;
            log.info("ServiceStatusCacheService initialized without Redis (Redis not available)");
        }
    }

    /**
     * Update service status in Redis cache.
     * If the health state actually changed, also publishes a status-change event
     * so SSE clients learn about transitions immediately.
     */
    public void updateServiceStatus(ServiceStatus status) {
        if (!checkRedisAvailable()) {
            log.warn("Redis unavailable, skipping status update for service: {}", status.getServiceName());
            return;
        }

        try {
            String key = STATUS_KEY_PREFIX + status.getServiceName();

            // Detect state transition before overwriting
            ServiceStatus previous = getServiceStatus(status.getServiceName()).orElse(null);
            HealthState oldState = previous != null ? previous.getHealthState() : null;
            HealthState newState = status.getHealthState();
            boolean stateChanged = oldState != null && oldState != newState;

            redisTemplate.opsForValue().set(key, status, STATUS_TTL_SECONDS, TimeUnit.SECONDS);

            // Add to active services set
            String serviceName = status.getServiceName();
            if (serviceName != null) {
                stringRedisTemplate.opsForSet().add(ALL_SERVICES_KEY, serviceName);
                stringRedisTemplate.expire(ALL_SERVICES_KEY, Duration.ofSeconds(STATUS_TTL_SECONDS));
            }

            // Publish status update (always)
            publishStatusUpdate(status);

            // Publish status-change event (only on actual transition)
            if (stateChanged) {
                publishStatusChange(serviceName, oldState, newState, status.getErrorMessage());
                persistTransition(serviceName, oldState, newState, status.getErrorMessage(),
                        status.getResponseTimeMs());
                log.info("State transition: {} {} → {}", serviceName, oldState, newState);
            }

            log.debug("Updated status for service: {} - {}", status.getServiceName(), status.getHealthState());
        } catch (Exception e) {
            handleRedisError("updateServiceStatus", e);
        }
    }

    /**
     * Record heartbeat from a service
     */
    public void recordHeartbeat(String serviceName, Long serviceId) {
        recordHeartbeatRich(serviceName, serviceId, null, null, null);
    }

    /**
     * Record heartbeat with rich metadata (version, build, metrics).
     * All parameters except serviceName and serviceId are optional.
     * If the service is in maintenance mode, heartbeats are recorded but
     * status updates are skipped (maintenance state is preserved).
     */
    public void recordHeartbeatRich(String serviceName, Long serviceId,
                                     String version, String build,
                                     Map<String, Object> metrics) {
        if (!checkRedisAvailable()) {
            return;
        }

        try {
            String heartbeatKey = HEARTBEAT_KEY_PREFIX + serviceName;
            Instant now = Instant.now();

            // Store heartbeat timestamp
            stringRedisTemplate.opsForValue().set(heartbeatKey, now.toString(), HEARTBEAT_TTL_SECONDS,
                    TimeUnit.SECONDS);

            // Store rich metadata if provided
            if (version != null || build != null) {
                var metadata = new java.util.HashMap<String, Object>();
                if (version != null) metadata.put("version", version);
                if (build != null) metadata.put("build", build);
                stringRedisTemplate.opsForValue().set(
                        "service:meta:" + serviceName,
                        objectMapper.writeValueAsString(metadata),
                        HEARTBEAT_TTL_SECONDS, TimeUnit.SECONDS);
            }

            // Skip status update if in maintenance mode
            if (isMaintenanceMode(serviceName)) {
                log.debug("Maintenance mode active for {} — heartbeat recorded, status not updated", serviceName);
                return;
            }

            // Update status if exists
            ServiceStatus status = getServiceStatus(serviceName).orElse(null);
            if (status != null) {
                status.setLastHeartbeat(now);
                status.setHealthState(HealthState.HEALTHY);
                if (metrics != null) {
                    status.setMetrics(metrics);
                }
                updateServiceStatus(status);
            } else {
                // Create initial status
                ServiceStatus newStatus = ServiceStatus.createInitial(serviceId, serviceName, null);
                if (metrics != null) {
                    newStatus.setMetrics(metrics);
                }
                updateServiceStatus(newStatus);
            }

            // Store metrics separately if provided
            if (metrics != null && !metrics.isEmpty()) {
                storeMetrics(serviceName, metrics);
            }

            // Publish heartbeat event (include rich metadata)
            publishHeartbeatRich(serviceName, now, version, build);

            log.debug("Recorded heartbeat for service: {} (version={}, build={})",
                    serviceName, version, build);
        } catch (Exception e) {
            handleRedisError("recordHeartbeatRich", e);
        }
    }

    /**
     * Graceful shutdown — immediately marks service OFFLINE and emits a
     * status-change event with reason "graceful-shutdown".
     * Called by services on SIGTERM for clean departure.
     */
    public void gracefulShutdown(String serviceName) {
        if (!checkRedisAvailable()) {
            return;
        }

        try {
            // Detect previous state for transition recording
            ServiceStatus previous = getServiceStatus(serviceName).orElse(null);
            HealthState oldState = previous != null ? previous.getHealthState() : null;
            Long serviceId = previous != null ? previous.getServiceId() : null;

            // Remove from Redis cache
            redisTemplate.delete(STATUS_KEY_PREFIX + serviceName);
            stringRedisTemplate.delete(HEARTBEAT_KEY_PREFIX + serviceName);
            stringRedisTemplate.delete("service:meta:" + serviceName);
            redisTemplate.delete(METRICS_KEY_PREFIX + serviceName);
            stringRedisTemplate.opsForSet().remove(ALL_SERVICES_KEY, serviceName);

            // Publish goodbye status-change event
            var changeData = new java.util.HashMap<String, Object>();
            changeData.put("serviceName", serviceName);
            changeData.put("oldState", oldState != null ? oldState.toString() : null);
            changeData.put("newState", "OFFLINE");
            changeData.put("reason", "graceful-shutdown");
            changeData.put("timestamp", Instant.now().toString());

            String changeMessage = objectMapper.writeValueAsString(changeData);
            stringRedisTemplate.convertAndSend(STATUS_CHANGE_CHANNEL, changeMessage);

            // Publish offline status update (for status-update listeners)
            ServiceStatus offlineStatus = ServiceStatus.builder()
                    .serviceId(serviceId)
                    .serviceName(serviceName)
                    .healthState(HealthState.OFFLINE)
                    .build();
            publishStatusUpdate(offlineStatus);

            // Persist transition
            persistTransition(serviceName, oldState, HealthState.OFFLINE,
                    "graceful-shutdown", null);

            log.info("Graceful shutdown: {} (was {})", serviceName, oldState);
        } catch (Exception e) {
            handleRedisError("gracefulShutdown", e);
        }
    }

    /**
     * Get service status from cache
     */
    public Optional<ServiceStatus> getServiceStatus(String serviceName) {
        if (!checkRedisAvailable()) {
            return Optional.empty();
        }

        try {
            String key = STATUS_KEY_PREFIX + serviceName;
            Object value = redisTemplate.opsForValue().get(key);

            if (value != null) {
                // Handle deserialization
                if (value instanceof ServiceStatus) {
                    return Optional.of((ServiceStatus) value);
                } else if (value instanceof Map) {
                    ServiceStatus status = objectMapper.convertValue(value, ServiceStatus.class);
                    return Optional.of(status);
                }
            }
            return Optional.empty();
        } catch (Exception e) {
            handleRedisError("getServiceStatus", e);
            return Optional.empty();
        }
    }

    /**
     * Get all active service statuses
     */
    public List<ServiceStatus> getAllServiceStatuses() {
        List<ServiceStatus> statuses = new ArrayList<>();

        if (!checkRedisAvailable()) {
            return statuses;
        }

        try {
            Set<String> serviceNames = stringRedisTemplate.opsForSet().members(ALL_SERVICES_KEY);
            if (serviceNames != null) {
                for (String serviceName : serviceNames) {
                    getServiceStatus(serviceName).ifPresent(statuses::add);
                }
            }
        } catch (Exception e) {
            handleRedisError("getAllServiceStatuses", e);
        }

        return statuses;
    }

    /**
     * Get last heartbeat timestamp for a service
     */
    public Optional<Instant> getLastHeartbeat(String serviceName) {
        if (!checkRedisAvailable()) {
            return Optional.empty();
        }

        try {
            String key = HEARTBEAT_KEY_PREFIX + serviceName;
            String value = stringRedisTemplate.opsForValue().get(key);

            if (value != null && !value.isEmpty()) {
                return Optional.of(Instant.parse(value));
            }
            return Optional.empty();
        } catch (Exception e) {
            handleRedisError("getLastHeartbeat", e);
            return Optional.empty();
        }
    }

    /**
     * Check if a service is stale (no recent heartbeat)
     */
    public boolean isServiceStale(String serviceName) {
        return getLastHeartbeat(serviceName)
                .map(hb -> Instant.now().minusSeconds(STALE_THRESHOLD_SECONDS).isAfter(hb))
                .orElse(true);
    }

    /**
     * Store service metrics
     */
    public void storeMetrics(String serviceName, Map<String, Object> metrics) {
        if (!checkRedisAvailable()) {
            return;
        }

        try {
            String key = METRICS_KEY_PREFIX + serviceName;
            redisTemplate.opsForValue().set(key, metrics, METRICS_TTL_SECONDS, TimeUnit.SECONDS);
            log.debug("Stored metrics for service: {}", serviceName);
        } catch (Exception e) {
            handleRedisError("storeMetrics", e);
        }
    }

    /**
     * Get service metrics
     */
    @SuppressWarnings("unchecked")
    public Optional<Map<String, Object>> getMetrics(String serviceName) {
        if (!checkRedisAvailable()) {
            return Optional.empty();
        }

        try {
            String key = METRICS_KEY_PREFIX + serviceName;
            Object value = redisTemplate.opsForValue().get(key);

            if (value instanceof Map) {
                return Optional.of((Map<String, Object>) value);
            }
            return Optional.empty();
        } catch (Exception e) {
            handleRedisError("getMetrics", e);
            return Optional.empty();
        }
    }

    /**
     * Remove service from cache (on deregistration)
     */
    public void removeService(String serviceName) {
        if (!checkRedisAvailable()) {
            return;
        }

        try {
            redisTemplate.delete(STATUS_KEY_PREFIX + serviceName);
            stringRedisTemplate.delete(HEARTBEAT_KEY_PREFIX + serviceName);
            redisTemplate.delete(METRICS_KEY_PREFIX + serviceName);
            stringRedisTemplate.opsForSet().remove(ALL_SERVICES_KEY, serviceName);

            // Publish offline status
            ServiceStatus offlineStatus = ServiceStatus.builder()
                    .serviceName(serviceName)
                    .healthState(HealthState.OFFLINE)
                    .build();
            publishStatusUpdate(offlineStatus);

            log.info("Removed service from cache: {}", serviceName);
        } catch (Exception e) {
            handleRedisError("removeService", e);
        }
    }

    /**
     * Mark stale services as offline
     */
    public List<String> markStaleServicesOffline() {
        List<String> staleServices = new ArrayList<>();

        if (!checkRedisAvailable()) {
            return staleServices;
        }

        try {
            Set<String> serviceNames = stringRedisTemplate.opsForSet().members(ALL_SERVICES_KEY);
            if (serviceNames != null) {
                for (String serviceName : serviceNames) {
                    if (isServiceStale(serviceName)) {
                        getServiceStatus(serviceName).ifPresent(status -> {
                            if (status.getHealthState() != HealthState.OFFLINE) {
                                status.setHealthState(HealthState.OFFLINE);
                                updateServiceStatus(status);
                                staleServices.add(serviceName);
                            }
                        });
                    }
                }
            }
        } catch (Exception e) {
            handleRedisError("markStaleServicesOffline", e);
        }

        return staleServices;
    }

    /**
     * Publish status update via pub/sub
     */
    private void publishStatusUpdate(ServiceStatus status) {
        try {
            String message = objectMapper.writeValueAsString(status);
            stringRedisTemplate.convertAndSend(SERVICE_STATUS_CHANNEL, message);
            log.debug("Published status update for service: {}", status.getServiceName());
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize status for pub/sub", e);
        }
    }

    /**
     * Publish heartbeat event via pub/sub (with optional rich metadata)
     */
    private void publishHeartbeat(String serviceName, Instant timestamp) {
        publishHeartbeatRich(serviceName, timestamp, null, null);
    }

    private void publishHeartbeatRich(String serviceName, Instant timestamp,
                                       String version, String build) {
        try {
            var data = new java.util.HashMap<String, Object>();
            data.put("serviceName", serviceName);
            data.put("timestamp", timestamp.toString());
            if (version != null) data.put("version", version);
            if (build != null) data.put("build", build);

            String message = objectMapper.writeValueAsString(data);
            stringRedisTemplate.convertAndSend(HEARTBEAT_CHANNEL, message);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize heartbeat for pub/sub", e);
        }
    }

    /**
     * Check if Redis is available
     */
    private boolean checkRedisAvailable() {
        if (!redisAvailable) {
            return false;
        }

        if (stringRedisTemplate == null) {
            return false;
        }

        try {
            stringRedisTemplate.getConnectionFactory().getConnection().ping();
            return true;
        } catch (Exception e) {
            redisAvailable = false;
            log.warn("Redis connection check failed, marking as unavailable", e);
            return false;
        }
    }

    /**
     * Handle Redis errors with graceful fallback
     */
    private void handleRedisError(String operation, Exception e) {
        log.warn("Redis error during {}: {} - falling back to database", operation, e.getMessage());
        redisAvailable = false;

        // Schedule a reconnection attempt
        // In production, this would be handled by a scheduled task
    }

    /**
     * Attempt to reconnect to Redis
     */
    public boolean attemptReconnect() {
        if (stringRedisTemplate == null) {
            return false;
        }
        try {
            stringRedisTemplate.getConnectionFactory().getConnection().ping();
            redisAvailable = true;
            log.info("Redis connection restored");
            return true;
        } catch (Exception e) {
            log.debug("Redis reconnection attempt failed", e);
            return false;
        }
    }

    /**
     * Check Redis health
     */
    public boolean isRedisHealthy() {
        return checkRedisAvailable();
    }

    /**
     * Get the pub/sub topic for status updates
     */
    public ChannelTopic getStatusUpdateTopic() {
        return new ChannelTopic(SERVICE_STATUS_CHANNEL);
    }

    /**
     * Get the pub/sub topic for heartbeats
     */
    public ChannelTopic getHeartbeatTopic() {
        return new ChannelTopic(HEARTBEAT_CHANNEL);
    }

    /**
     * Get the pub/sub topic for status changes
     */
    public ChannelTopic getStatusChangeTopic() {
        return new ChannelTopic(STATUS_CHANGE_CHANNEL);
    }

    /**
     * Publish a status-change event when a service transitions between states.
     * This is a separate channel from status-update so clients can subscribe
     * specifically to transitions.
     */
    private void publishStatusChange(String serviceName, HealthState oldState,
                                     HealthState newState, String errorMessage) {
        try {
            var data = new java.util.HashMap<String, Object>();
            data.put("serviceName", serviceName);
            data.put("oldState", oldState != null ? oldState.toString() : null);
            data.put("newState", newState.toString());
            data.put("timestamp", Instant.now().toString());
            if (errorMessage != null) {
                data.put("errorMessage", errorMessage);
            }

            String message = objectMapper.writeValueAsString(data);
            stringRedisTemplate.convertAndSend(STATUS_CHANGE_CHANNEL, message);
            log.debug("Published status-change for {}: {} → {}", serviceName, oldState, newState);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize status-change for pub/sub", e);
        }
    }

    /**
     * Get all service statuses as a list for snapshot events.
     * Returns the raw list from Redis cache (may be empty if Redis is down).
     */
    public List<ServiceStatus> getSnapshotStatuses() {
        return getAllServiceStatuses();
    }

    /**
     * Persist a status transition to the database asynchronously.
     * Fire-and-forget: failures are logged but don't affect the hot path.
     */
    private void persistTransition(String serviceName, HealthState oldState,
                                   HealthState newState, String errorMessage,
                                   Long responseTimeMs) {
        if (statusEventRepository == null) {
            return; // DB not available
        }
        try {
            com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.StatusEvent event =
                    new com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.StatusEvent(
                            serviceName,
                            oldState != null ? oldState.toString() : null,
                            newState.toString(),
                            "heartbeat-stale".equals(errorMessage) ? "heartbeat-stale" : "health-check",
                            responseTimeMs,
                            errorMessage);
            statusEventRepository.save(event);
        } catch (Exception e) {
            log.debug("Failed to persist status transition for {}: {}", serviceName, e.getMessage());
        }
    }

    // --- Maintenance mode ---

    /**
     * Set a service into maintenance mode with a target state (OFFLINE or DEGRADED).
     * While in maintenance mode, heartbeat-driven status updates are ignored,
     * and the service remains in the specified state.
     */
    public void setMaintenanceMode(String serviceName, String targetState, @Nullable String reason) {
        String key = MAINTENANCE_KEY_PREFIX + serviceName;
        String value = targetState + "|" + (reason != null ? reason : "");
        stringRedisTemplate.opsForValue().set(key, value);
        log.info("Maintenance mode ON for {}: state={}", serviceName, targetState);

        // Immediately force the service into the target state
        ServiceStatus status = getServiceStatus(serviceName).orElse(
                ServiceStatus.builder()
                        .serviceId(0L)
                        .serviceName(serviceName)
                        .build());
        status.setHealthState(HealthState.valueOf(targetState));
        status.setErrorMessage(reason);
        updateServiceStatus(status);
    }

    /**
     * Clear maintenance mode for a service.
     * The next heartbeat will restore the service to its actual state.
     */
    public void clearMaintenanceMode(String serviceName) {
        stringRedisTemplate.delete(MAINTENANCE_KEY_PREFIX + serviceName);
        log.info("Maintenance mode OFF for {}", serviceName);
    }

    /**
     * Check if a service is currently in maintenance mode.
     */
    public boolean isMaintenanceMode(String serviceName) {
        return Boolean.TRUE.equals(stringRedisTemplate.hasKey(MAINTENANCE_KEY_PREFIX + serviceName));
    }

    /**
     * Get the maintenance mode target state for a service, or null if not in maintenance.
     * Format: "OFFLINE|reason" or "DEGRADED|reason"
     */
    @Nullable
    public String getMaintenanceMode(String serviceName) {
        String val = stringRedisTemplate.opsForValue().get(MAINTENANCE_KEY_PREFIX + serviceName);
        return val;
    }

    /**
     * List all services currently in maintenance mode.
     */
    public java.util.Map<String, String> getAllMaintenanceMode() {
        java.util.Map<String, String> result = new java.util.HashMap<>();
        var keys = stringRedisTemplate.keys(MAINTENANCE_KEY_PREFIX + "*");
        if (keys != null) {
            for (String key : keys) {
                String serviceName = key.substring(MAINTENANCE_KEY_PREFIX.length());
                String val = stringRedisTemplate.opsForValue().get(key);
                if (val != null) {
                    result.put(serviceName, val);
                }
            }
        }
        return result;
    }
}
