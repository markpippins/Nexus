package nexus.serviceregistry.v1.service;

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
import org.springframework.stereotype.Service;

import com.angrysurfer.nexus.dto.ServiceStatus;
import com.angrysurfer.nexus.dto.ServiceStatus.HealthState;
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
    private static final String ALL_SERVICES_KEY = "services:active";

    // Pub/Sub channels
    public static final String SERVICE_STATUS_CHANNEL = "service-status-updates";
    public static final String HEARTBEAT_CHANNEL = "service-heartbeats";

    // TTL values
    private static final long STATUS_TTL_SECONDS = 300; // 5 minutes
    private static final long HEARTBEAT_TTL_SECONDS = 60; // 1 minute
    private static final long METRICS_TTL_SECONDS = 120; // 2 minutes

    // Stale threshold
    private static final long STALE_THRESHOLD_SECONDS = 90;

    private final RedisTemplate<String, Object> redisTemplate;
    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;

    // Flag to track Redis availability
    private volatile boolean redisAvailable = true;

    public ServiceStatusCacheService(RedisTemplate<String, Object> redisTemplate,
            StringRedisTemplate stringRedisTemplate,
            ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.stringRedisTemplate = stringRedisTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * Update service status in Redis cache
     */
    public void updateServiceStatus(ServiceStatus status) {
        if (!checkRedisAvailable()) {
            log.warn("Redis unavailable, skipping status update for service: {}", status.getServiceName());
            return;
        }

        try {
            String key = STATUS_KEY_PREFIX + status.getServiceName();
            redisTemplate.opsForValue().set(key, status, STATUS_TTL_SECONDS, TimeUnit.SECONDS);

            // Add to active services set
            String serviceName = status.getServiceName();
            if (serviceName != null) {
                stringRedisTemplate.opsForSet().add(ALL_SERVICES_KEY, serviceName);
                stringRedisTemplate.expire(ALL_SERVICES_KEY, Duration.ofSeconds(STATUS_TTL_SECONDS));
            }

            // Publish status update
            publishStatusUpdate(status);

            log.debug("Updated status for service: {} - {}", status.getServiceName(), status.getHealthState());
        } catch (Exception e) {
            handleRedisError("updateServiceStatus", e);
        }
    }

    /**
     * Record heartbeat from a service
     */
    public void recordHeartbeat(String serviceName, Long serviceId) {
        if (!checkRedisAvailable()) {
            return;
        }

        try {
            String heartbeatKey = HEARTBEAT_KEY_PREFIX + serviceName;
            Instant now = Instant.now();

            // Store heartbeat timestamp
            stringRedisTemplate.opsForValue().set(heartbeatKey, now.toString(), HEARTBEAT_TTL_SECONDS,
                    TimeUnit.SECONDS);

            // Update status if exists
            ServiceStatus status = getServiceStatus(serviceName).orElse(null);
            if (status != null) {
                status.setLastHeartbeat(now);
                status.setHealthState(HealthState.HEALTHY);
                updateServiceStatus(status);
            } else {
                // Create initial status
                ServiceStatus newStatus = ServiceStatus.createInitial(serviceId, serviceName, null);
                updateServiceStatus(newStatus);
            }

            // Publish heartbeat event
            publishHeartbeat(serviceName, now);

            log.debug("Recorded heartbeat for service: {}", serviceName);
        } catch (Exception e) {
            handleRedisError("recordHeartbeat", e);
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
     * Publish heartbeat event via pub/sub
     */
    private void publishHeartbeat(String serviceName, Instant timestamp) {
        try {
            String message = objectMapper.writeValueAsString(Map.of(
                    "serviceName", serviceName,
                    "timestamp", timestamp.toString()));
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
}
