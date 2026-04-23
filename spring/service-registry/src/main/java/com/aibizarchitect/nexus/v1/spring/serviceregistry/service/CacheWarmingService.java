package com.aibizarchitect.nexus.v1.spring.serviceregistry.service;

import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.cache.CacheManager;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Deployment;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.EnvironmentType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Framework;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.FrameworkCategory;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.FrameworkLanguage;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.LibraryCategory;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServerType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServiceType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.DeploymentRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.EnvironmentTypeRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkCategoryRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkLanguageRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.FrameworkRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.LibraryCategoryRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServerTypeRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceTypeRepository;

/**
 * Service responsible for warming caches on application startup and
 * periodically.
 * Pre-loads critical data into Redis to minimize cold-start latency.
 */
@Service
@EnableScheduling
public class CacheWarmingService {

    private static final Logger log = LoggerFactory.getLogger(CacheWarmingService.class);

    // Static lookup repositories
    private final FrameworkRepository frameworkRepository;
    private final FrameworkCategoryRepository frameworkCategoryRepository;
    private final FrameworkLanguageRepository frameworkLanguageRepository;
    private final ServiceTypeRepository serviceTypeRepository;
    private final ServerTypeRepository serverTypeRepository;
    private final EnvironmentTypeRepository environmentTypeRepository;
    private final LibraryCategoryRepository libraryCategoryRepository;

    // Dynamic data repositories
    private final ServiceRepository serviceRepository;
    private final DeploymentRepository deploymentRepository;

    private final Optional<CacheManager> cacheManager;

    public CacheWarmingService(FrameworkRepository frameworkRepository,
            FrameworkCategoryRepository frameworkCategoryRepository,
            FrameworkLanguageRepository frameworkLanguageRepository,
            ServiceTypeRepository serviceTypeRepository,
            ServerTypeRepository serverTypeRepository,
            EnvironmentTypeRepository environmentTypeRepository,
            LibraryCategoryRepository libraryCategoryRepository,
            ServiceRepository serviceRepository,
            DeploymentRepository deploymentRepository,
            Optional<CacheManager> cacheManager) {
        this.frameworkRepository = frameworkRepository;
        this.frameworkCategoryRepository = frameworkCategoryRepository;
        this.frameworkLanguageRepository = frameworkLanguageRepository;
        this.serviceTypeRepository = serviceTypeRepository;
        this.serverTypeRepository = serverTypeRepository;
        this.environmentTypeRepository = environmentTypeRepository;
        this.libraryCategoryRepository = libraryCategoryRepository;
        this.serviceRepository = serviceRepository;
        this.deploymentRepository = deploymentRepository;
        this.cacheManager = cacheManager;
    }

    /**
     * Warm static lookup caches on application startup.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void warmStaticCachesOnStartup() {
        log.info("Starting cache warming on application startup...");
        long startTime = System.currentTimeMillis();

        try {
            warmStaticCaches();
            warmDynamicCaches();

            long duration = System.currentTimeMillis() - startTime;
            log.info("Cache warming completed successfully in {} ms", duration);
        } catch (Exception e) {
            log.error("Cache warming failed", e);
        }
    }

    /**
     * Warm static lookup data caches.
     */
    public void warmStaticCaches() {
        log.debug("Warming static lookup caches...");

        try {
            // Framework Categories
            List<FrameworkCategory> categories = frameworkCategoryRepository.findAll();
            log.debug("Pre-loaded {} framework categories", categories.size());

            // Framework Languages
            List<FrameworkLanguage> languages = frameworkLanguageRepository.findAll();
            log.debug("Pre-loaded {} framework languages", languages.size());

            // Service Types
            List<ServiceType> serviceTypes = serviceTypeRepository.findAll();
            log.debug("Pre-loaded {} service types", serviceTypes.size());

            // Server Types
            List<ServerType> serverTypes = serverTypeRepository.findAll();
            log.debug("Pre-loaded {} server types", serverTypes.size());

            // Environment Types
            List<EnvironmentType> environmentTypes = environmentTypeRepository.findAll();
            log.debug("Pre-loaded {} environment types", environmentTypes.size());

            // Library Categories
            List<LibraryCategory> libraryCategories = libraryCategoryRepository.findAll();
            log.debug("Pre-loaded {} library categories", libraryCategories.size());

            // Frameworks (load after categories and languages)
            List<Framework> frameworks = frameworkRepository.findAll();
            log.debug("Pre-loaded {} frameworks", frameworks.size());

            // Trigger caching by name for frequently accessed items
            categories.forEach(c -> frameworkCategoryRepository.findByName(c.getName()));
            languages.forEach(l -> frameworkLanguageRepository.findByName(l.getName()));
            serviceTypes.forEach(st -> serviceTypeRepository.findByName(st.getName()));
            serverTypes.forEach(st -> serverTypeRepository.findByName(st.getName()));
            environmentTypes.forEach(et -> environmentTypeRepository.findByName(et.getName()));

            log.info("Static lookup caches warmed successfully");
        } catch (Exception e) {
            log.warn("Failed to warm static caches: {}", e.getMessage());
        }
    }

    /**
     * Warm critical dynamic data caches.
     */
    public void warmDynamicCaches() {
        log.debug("Warming dynamic data caches...");

        try {
            // Load all active services
            List<com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service> services = serviceRepository.findAll();
            log.debug("Pre-loaded {} services", services.size());

            // Trigger caching by name for all services
            services.forEach(s -> {
                if (s.getName() != null) {
                    serviceRepository.findByName(s.getName());
                }
            });

            // Load all deployments
            List<Deployment> deployments = deploymentRepository.findAll();
            log.debug("Pre-loaded {} deployments", deployments.size());

            log.info("Dynamic data caches warmed successfully");
        } catch (Exception e) {
            log.warn("Failed to warm dynamic caches: {}", e.getMessage());
        }
    }

    /**
     * Periodically refresh caches (every hour by default).
     * Configurable via cache.warming.schedule property.
     */
    @Scheduled(fixedRateString = "${cache.warming.schedule:3600000}")
    public void warmCachesPeriodically() {
        log.info("Starting periodic cache warming...");

        try {
            warmStaticCaches();
            warmDynamicCaches();
            log.info("Periodic cache warming completed");
        } catch (Exception e) {
            log.error("Periodic cache warming failed", e);
        }
    }

    /**
     * Check if a cache is populated.
     */
    public boolean isCachePopulated(String cacheName) {
        if (cacheManager.isEmpty()) {
            return false;
        }
        try {
            org.springframework.cache.Cache cache = cacheManager.get().getCache(cacheName);
            if (cache == null) {
                return false;
            }

            // Check if cache has any entries
            // Note: This is a basic check. For production, you might want more
            // sophisticated logic
            return cache.get("*") != null;
        } catch (Exception e) {
            log.debug("Error checking cache population for {}: {}", cacheName, e.getMessage());
            return false;
        }
    }

    /**
     * Get cache statistics for monitoring.
     */
    public String getCacheStatistics() {
        StringBuilder stats = new StringBuilder();
        stats.append("Cache Statistics:\n");

        if (cacheManager.isPresent()) {
            try {
                for (String cacheName : cacheManager.get().getCacheNames()) {
                    org.springframework.cache.Cache cache = cacheManager.get().getCache(cacheName);
                    if (cache != null) {
                        stats.append(String.format("  - %s: active\n", cacheName));
                    }
                }
            } catch (Exception e) {
                stats.append("Error retrieving cache statistics: ").append(e.getMessage());
            }
        }

        return stats.toString();
    }

    /**
     * Clear all caches (for admin/testing purposes).
     */
    public void clearAllCaches() {
        if (cacheManager.isEmpty()) {
            log.debug("No cache manager available, skipping cache clear");
            return;
        }
        log.warn("Clearing all caches...");

        try {
            for (String cacheName : cacheManager.get().getCacheNames()) {
                org.springframework.cache.Cache cache = cacheManager.get().getCache(cacheName);
                if (cache != null) {
                    cache.clear();
                    log.debug("Cleared cache: {}", cacheName);
                }
            }
            log.info("All caches cleared successfully");
        } catch (Exception e) {
            log.error("Failed to clear all caches", e);
        }
    }
}
