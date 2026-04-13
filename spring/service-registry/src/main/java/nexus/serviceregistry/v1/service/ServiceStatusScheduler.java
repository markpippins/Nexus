package nexus.serviceregistry.v1.service;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Scheduled tasks for maintaining service status and Redis health.
 */
@Service
@EnableScheduling
public class ServiceStatusScheduler {

    private static final Logger log = LoggerFactory.getLogger(ServiceStatusScheduler.class);

    private final ServiceStatusCacheService cacheService;

    public ServiceStatusScheduler(ServiceStatusCacheService cacheService) {
        this.cacheService = cacheService;
    }

    /**
     * Check for stale services and mark them as offline.
     * Runs every 30 seconds.
     */
    @Scheduled(fixedRate = 30000)
    public void checkStaleServices() {
        try {
            List<String> staleServices = cacheService.markStaleServicesOffline();
            if (!staleServices.isEmpty()) {
                log.info("Marked {} services as offline due to stale heartbeats: {}",
                        staleServices.size(), staleServices);
            }
        } catch (Exception e) {
            log.warn("Error during stale service check", e);
        }
    }

    /**
     * Attempt to reconnect to Redis if it's unavailable.
     * Runs every 60 seconds.
     */
    @Scheduled(fixedRate = 60000)
    public void redisHealthCheck() {
        if (!cacheService.isRedisHealthy()) {
            log.info("Attempting to reconnect to Redis...");
            if (cacheService.attemptReconnect()) {
                log.info("Redis connection restored");
            }
        }
    }
}
