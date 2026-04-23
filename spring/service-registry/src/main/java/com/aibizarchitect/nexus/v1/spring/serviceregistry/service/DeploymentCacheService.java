package com.aibizarchitect.nexus.v1.spring.serviceregistry.service;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Deployment;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.DeploymentRepository;

/**
 * Service implementing cache-aside pattern for Deployment entity operations.
 * Provides explicit cache management with Redis fallback to database.
 * If Redis is not available, operations fall back directly to the database.
 */
@Service
public class DeploymentCacheService {

    private static final Logger log = LoggerFactory.getLogger(DeploymentCacheService.class);

    private static final String DEPLOYMENT_KEY_PREFIX = "cache:deployment:";
    private static final String DEPLOYMENTS_BY_SERVICE_PREFIX = "cache:deployments:service:";
    private static final String DEPLOYMENTS_BY_SERVER_PREFIX = "cache:deployments:server:";
    private static final String DEPLOYMENTS_BY_ENV_PREFIX = "cache:deployments:env:";
    private static final long TTL_MINUTES = 15;

    private final RedisTemplate<String, Object> redisTemplate;
    private final DeploymentRepository deploymentRepository;

    public DeploymentCacheService(@Nullable RedisTemplate<String, Object> redisTemplate,
            DeploymentRepository deploymentRepository) {
        this.redisTemplate = redisTemplate;
        this.deploymentRepository = deploymentRepository;
        if (redisTemplate == null) {
            log.warn("Redis is not available - DeploymentCacheService will operate without caching");
        }
    }

    /**
     * Check if Redis caching is available.
     */
    private boolean isCacheAvailable() {
        return redisTemplate != null;
    }

    /**
     * Get deployment by ID using cache-aside pattern.
     */
    public Optional<Deployment> getDeployment(Long id) {
        String key = DEPLOYMENT_KEY_PREFIX + id;

        try {
            Object cached = redisTemplate.opsForValue().get(key);
            if (cached != null) {
                log.debug("Cache hit for deployment ID: {}", id);
                return Optional.of((Deployment) cached);
            }
        } catch (Exception e) {
            log.warn("Redis error getting deployment {}, falling back to database: {}", id, e.getMessage());
        }

        log.debug("Cache miss for deployment ID: {}", id);
        Optional<Deployment> deployment = deploymentRepository.findById(id);

        deployment.ifPresent(this::cacheDeployment);

        return deployment;
    }

    /**
     * Get deployments by service ID.
     */
    public List<Deployment> getDeploymentsByServiceId(Long serviceId) {
        String key = DEPLOYMENTS_BY_SERVICE_PREFIX + serviceId;

        try {
            @SuppressWarnings("unchecked")
            List<Deployment> cached = (List<Deployment>) redisTemplate.opsForValue().get(key);
            if (cached != null) {
                log.debug("Cache hit for deployments by service ID: {}", serviceId);
                return cached;
            }
        } catch (Exception e) {
            log.warn("Redis error getting deployments by service {}, falling back to database: {}", serviceId,
                    e.getMessage());
        }

        log.debug("Cache miss for deployments by service ID: {}", serviceId);
        List<Deployment> deployments = deploymentRepository.findByServiceId(serviceId);

        try {
            redisTemplate.opsForValue().set(key, deployments, TTL_MINUTES, TimeUnit.MINUTES);
        } catch (Exception e) {
            log.warn("Failed to cache deployments by service {}: {}", serviceId, e.getMessage());
        }

        return deployments;
    }

    /**
     * Get deployments by server ID.
     */
    public List<Deployment> getDeploymentsByServerId(Long serverId) {
        String key = DEPLOYMENTS_BY_SERVER_PREFIX + serverId;

        try {
            @SuppressWarnings("unchecked")
            List<Deployment> cached = (List<Deployment>) redisTemplate.opsForValue().get(key);
            if (cached != null) {
                log.debug("Cache hit for deployments by server ID: {}", serverId);
                return cached;
            }
        } catch (Exception e) {
            log.warn("Redis error getting deployments by server {}, falling back to database: {}", serverId,
                    e.getMessage());
        }

        log.debug("Cache miss for deployments by server ID: {}", serverId);
        List<Deployment> deployments = deploymentRepository.findByServerId(serverId);

        try {
            redisTemplate.opsForValue().set(key, deployments, TTL_MINUTES, TimeUnit.MINUTES);
        } catch (Exception e) {
            log.warn("Failed to cache deployments by server {}: {}", serverId, e.getMessage());
        }

        return deployments;
    }

    /**
     * Get deployments by environment ID.
     */
    public List<Deployment> getDeploymentsByEnvironmentId(Long environmentId) {
        String key = DEPLOYMENTS_BY_ENV_PREFIX + environmentId;

        try {
            @SuppressWarnings("unchecked")
            List<Deployment> cached = (List<Deployment>) redisTemplate.opsForValue().get(key);
            if (cached != null) {
                log.debug("Cache hit for deployments by environment ID: {}", environmentId);
                return cached;
            }
        } catch (Exception e) {
            log.warn("Redis error getting deployments by environment {}, falling back to database: {}", environmentId,
                    e.getMessage());
        }

        log.debug("Cache miss for deployments by environment ID: {}", environmentId);
        List<Deployment> deployments = deploymentRepository.findByEnvironmentId(environmentId);

        try {
            redisTemplate.opsForValue().set(key, deployments, TTL_MINUTES, TimeUnit.MINUTES);
        } catch (Exception e) {
            log.warn("Failed to cache deployments by environment {}: {}", environmentId, e.getMessage());
        }

        return deployments;
    }

    /**
     * Create a new deployment and cache it.
     */
    @Transactional
    public Deployment createDeployment(Deployment deployment) {
        Deployment saved = deploymentRepository.save(deployment);
        cacheDeployment(saved);
        invalidateListCachesForDeployment(saved);
        log.info("Created and cached deployment ID: {}", saved.getId());
        return saved;
    }

    /**
     * Update deployment and refresh cache.
     */
    @Transactional
    public Deployment updateDeployment(Deployment deployment) {
        Deployment updated = deploymentRepository.save(deployment);
        cacheDeployment(updated);
        invalidateListCachesForDeployment(updated);
        log.info("Updated and cached deployment ID: {}", updated.getId());
        return updated;
    }

    /**
     * Delete deployment and evict from cache.
     */
    @Transactional
    public void deleteDeployment(Long id) {
        Optional<Deployment> deployment = deploymentRepository.findById(id);
        deployment.ifPresent(d -> {
            deploymentRepository.deleteById(id);
            evictDeployment(d);
            invalidateListCachesForDeployment(d);
            log.info("Deleted and evicted deployment ID: {}", id);
        });
    }

    /**
     * Cache a deployment entity.
     */
    private void cacheDeployment(Deployment deployment) {
        try {
            String key = DEPLOYMENT_KEY_PREFIX + deployment.getId();
            redisTemplate.opsForValue().set(key, deployment, TTL_MINUTES, TimeUnit.MINUTES);
            log.debug("Cached deployment ID: {}", deployment.getId());
        } catch (Exception e) {
            log.warn("Failed to cache deployment {}: {}", deployment.getId(), e.getMessage());
        }
    }

    /**
     * Evict a deployment from cache.
     */
    private void evictDeployment(Deployment deployment) {
        try {
            redisTemplate.delete(DEPLOYMENT_KEY_PREFIX + deployment.getId());
            log.debug("Evicted deployment from cache ID: {}", deployment.getId());
        } catch (Exception e) {
            log.warn("Failed to evict deployment from cache: {}", e.getMessage());
        }
    }

    /**
     * Invalidate list caches related to this deployment.
     */
    private void invalidateListCachesForDeployment(Deployment deployment) {
        try {
            redisTemplate.delete(DEPLOYMENTS_BY_SERVICE_PREFIX + deployment.getServiceId());
            redisTemplate.delete(DEPLOYMENTS_BY_SERVER_PREFIX + deployment.getServerId());
            redisTemplate.delete(DEPLOYMENTS_BY_ENV_PREFIX + deployment.getEnvironmentId());
            log.debug("Invalidated list caches for deployment ID: {}", deployment.getId());
        } catch (Exception e) {
            log.warn("Failed to invalidate list caches for deployment: {}", e.getMessage());
        }
    }

    /**
     * Clear all deployment caches.
     */
    public void clearAllCaches() {
        try {
            redisTemplate.delete(redisTemplate.keys(DEPLOYMENT_KEY_PREFIX + "*"));
            redisTemplate.delete(redisTemplate.keys(DEPLOYMENTS_BY_SERVICE_PREFIX + "*"));
            redisTemplate.delete(redisTemplate.keys(DEPLOYMENTS_BY_SERVER_PREFIX + "*"));
            redisTemplate.delete(redisTemplate.keys(DEPLOYMENTS_BY_ENV_PREFIX + "*"));
            log.info("Cleared all deployment caches");
        } catch (Exception e) {
            log.warn("Failed to clear deployment caches: {}", e.getMessage());
        }
    }
}
