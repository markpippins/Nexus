package com.aibizarchitect.nexus.v1.spring.serviceregistry.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServiceConfiguration;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServiceDependency;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.SystemServices;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceConfigurationRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceDependencyRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.SystemServicesRepository;

/**
 * Service implementing cache-aside pattern for Service entity operations.
 * Provides explicit cache management with Redis fallback to database.
 * If Redis is not available, operations fall back directly to the database.
 */
@Service
public class ServiceCacheService {

    private static final Logger log = LoggerFactory.getLogger(ServiceCacheService.class);

    private static final String SERVICE_KEY_PREFIX = "cache:service:";
    private static final String SERVICE_BY_NAME_KEY_PREFIX = "cache:service:name:";
    private static final String ALL_SERVICES_KEY = "cache:services:all";
    private static final long TTL_MINUTES = 15;

    private final RedisTemplate<String, Object> redisTemplate;
    private final ServiceRepository serviceRepository;
    private final ServiceConfigurationRepository serviceConfigurationRepository;
    private final ServiceDependencyRepository serviceDependencyRepository;
    private final SystemServicesRepository systemServicesRepository;

    public ServiceCacheService(@Nullable RedisTemplate<String, Object> redisTemplate,
            ServiceRepository serviceRepository,
            ServiceConfigurationRepository serviceConfigurationRepository,
            ServiceDependencyRepository serviceDependencyRepository,
            SystemServicesRepository systemServicesRepository) {
        this.redisTemplate = redisTemplate;
        this.serviceRepository = serviceRepository;
        this.serviceConfigurationRepository = serviceConfigurationRepository;
        this.serviceDependencyRepository = serviceDependencyRepository;
        this.systemServicesRepository = systemServicesRepository;
        if (redisTemplate == null) {
            log.warn("Redis is not available - ServiceCacheService will operate without caching");
        }
    }

    /**
     * Check if Redis caching is available.
     */
    private boolean isCacheAvailable() {
        return redisTemplate != null;
    }

    /**
     * Get service by ID using cache-aside pattern.
     * Check cache first, if miss fetch from DB and store in cache.
     */
    public Optional<com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service> getService(Long id) {
        String key = SERVICE_KEY_PREFIX + id;

        if (isCacheAvailable()) {
            try {
                // Try cache first
                Object cached = redisTemplate.opsForValue().get(key);
                if (cached != null) {
                    log.debug("Cache hit for service ID: {}", id);
                    return Optional.of((com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service) cached);
                }
            } catch (Exception e) {
                log.warn("Redis error getting service {}, falling back to database: {}", id, e.getMessage());
            }
        }

        // Cache miss or cache not available - fetch from database
        log.debug("Cache miss for service ID: {}", id);
        Optional<com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service> service = serviceRepository.findById(id);

        // Store in cache if found and cache is available
        service.ifPresent(s -> cacheService(s));

        return service;
    }

    /**
     * Get service by name using cache-aside pattern.
     */
    public Optional<com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service> getServiceByName(String name) {
        String key = SERVICE_BY_NAME_KEY_PREFIX + name;

        if (isCacheAvailable()) {
            try {
                Object cached = redisTemplate.opsForValue().get(key);
                if (cached != null) {
                    log.debug("Cache hit for service name: {}", name);
                    return Optional.of((com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service) cached);
                }
            } catch (Exception e) {
                log.warn("Redis error getting service by name {}, falling back to database: {}", name, e.getMessage());
            }
        }

        log.debug("Cache miss for service name: {}", name);
        Optional<com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service> service = serviceRepository.findByName(name);

        service.ifPresent(s -> cacheService(s));

        return service;
    }

    /**
     * Get all services (with caching).
     */
    public List<com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service> getAllServices() {
        if (isCacheAvailable()) {
            try {
                @SuppressWarnings("unchecked")
                List<com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service> cached = (List<com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service>) redisTemplate
                        .opsForValue().get(ALL_SERVICES_KEY);
                if (cached != null) {
                    log.debug("Cache hit for all services");
                    return cached;
                }
            } catch (Exception e) {
                log.warn("Redis error getting all services, falling back to database: {}", e.getMessage());
            }
        }

        log.debug("Cache miss for all services");
        List<com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service> services = serviceRepository.findAll();

        if (isCacheAvailable()) {
            try {
                redisTemplate.opsForValue().set(ALL_SERVICES_KEY, services, TTL_MINUTES, TimeUnit.MINUTES);
            } catch (Exception e) {
                log.warn("Failed to cache all services: {}", e.getMessage());
            }
        }

        return services;
    }

    /**
     * Create a new service and cache it.
     */
    @Transactional
    public com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service createService(
            com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service service) {
        com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service saved = serviceRepository.save(service);
        cacheService(saved);
        invalidateAllServicesCache();
        log.info("Created and cached service: {}", saved.getName());
        return saved;
    }

    /**
     * Update service and refresh cache.
     */
    @Transactional
    public com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service updateService(
            com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service service) {
        com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service updated = serviceRepository.save(service);
        cacheService(updated);
        invalidateAllServicesCache();
        log.info("Updated and cached service: {}", updated.getName());
        return updated;
    }

    /**
     * Delete service and evict from cache.
     * Clears uncascaded FK dependents (configs, dependencies, system mappings)
     * and promotes children to top-level before the hard delete (T27).
     */
    @Transactional
    public void deleteService(Long id) {
        Optional<com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service> service = serviceRepository.findById(id);
        service.ifPresent(s -> {
            // Promote child services to top-level (self-FK parent_service_id)
            List<com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service> subModules = serviceRepository
                    .findByParentService_Id(id);
            if (!subModules.isEmpty()) {
                subModules.forEach(child -> child.setParentService(null));
                serviceRepository.saveAll(subModules);
            }
            // Service configurations (uncascaded FK)
            List<ServiceConfiguration> configs = serviceConfigurationRepository.findByServiceId(id);
            if (!configs.isEmpty()) {
                serviceConfigurationRepository.deleteAll(configs);
            }
            // Dependencies in both directions
            List<ServiceDependency> deps = new ArrayList<>();
            deps.addAll(serviceDependencyRepository.findByServiceId(id));
            deps.addAll(serviceDependencyRepository.findByTargetServiceId(id));
            if (!deps.isEmpty()) {
                serviceDependencyRepository.deleteAll(deps);
            }
            // System-service mappings
            List<SystemServices> systemMappings = systemServicesRepository.findByServiceId(id);
            if (!systemMappings.isEmpty()) {
                systemServicesRepository.deleteAll(systemMappings);
            }

            serviceRepository.deleteById(id);
            evictService(s);
            invalidateAllServicesCache();
            log.info("Deleted and evicted service: {}", s.getName());
        });
    }

    /**
     * Cache a service entity.
     */
    private void cacheService(com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service service) {
        if (!isCacheAvailable())
            return;
        try {
            String idKey = SERVICE_KEY_PREFIX + service.getId();
            String nameKey = SERVICE_BY_NAME_KEY_PREFIX + service.getName();

            redisTemplate.opsForValue().set(idKey, service, TTL_MINUTES, TimeUnit.MINUTES);
            redisTemplate.opsForValue().set(nameKey, service, TTL_MINUTES, TimeUnit.MINUTES);

            log.debug("Cached service: {} (ID: {})", service.getName(), service.getId());
        } catch (Exception e) {
            log.warn("Failed to cache service {}: {}", service.getId(), e.getMessage());
        }
    }

    /**
     * Evict a service from cache.
     */
    private void evictService(com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service service) {
        if (!isCacheAvailable())
            return;
        try {
            redisTemplate.delete(SERVICE_KEY_PREFIX + service.getId());
            redisTemplate.delete(SERVICE_BY_NAME_KEY_PREFIX + service.getName());
            log.debug("Evicted service from cache: {}", service.getName());
        } catch (Exception e) {
            log.warn("Failed to evict service from cache: {}", e.getMessage());
        }
    }

    /**
     * Invalidate the all services cache.
     */
    private void invalidateAllServicesCache() {
        if (!isCacheAvailable())
            return;
        try {
            redisTemplate.delete(ALL_SERVICES_KEY);
            log.debug("Invalidated all services cache");
        } catch (Exception e) {
            log.warn("Failed to invalidate all services cache: {}", e.getMessage());
        }
    }

    /**
     * Clear all service caches.
     */
    public void clearAllCaches() {
        if (!isCacheAvailable()) {
            log.warn("Cannot clear caches - Redis is not available");
            return;
        }
        try {
            redisTemplate.delete(redisTemplate.keys(SERVICE_KEY_PREFIX + "*"));
            redisTemplate.delete(redisTemplate.keys(SERVICE_BY_NAME_KEY_PREFIX + "*"));
            redisTemplate.delete(ALL_SERVICES_KEY);
            log.info("Cleared all service caches");
        } catch (Exception e) {
            log.warn("Failed to clear service caches: {}", e.getMessage());
        }
    }
}
