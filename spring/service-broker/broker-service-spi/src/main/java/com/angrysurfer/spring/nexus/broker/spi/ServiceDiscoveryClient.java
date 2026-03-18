package com.angrysurfer.spring.nexus.broker.spi;

import java.util.Optional;

/**
 * Interface for discovering services from the registry.
 * Implementations can discover services from service-registry, Consul, Eureka,
 * etc.
 */
public interface ServiceDiscoveryClient {

    /**
     * Find service that can handle the specified operation
     */
    Optional<ServiceInfo> findServiceByOperation(String operation);

    /**
     * Get detailed service information including endpoint URL
     */
    Optional<ServiceDetails> getServiceDetails(String serviceName);

    /**
     * Basic service information
     */
    interface ServiceInfo {
        Long getId();

        String getName();

        String getDescription();

        String getStatus();
    }

    /**
     * Detailed service information including endpoint
     */
    interface ServiceDetails {
        String getServiceName();

        String getEndpoint();

        String getHealthCheck();

        String getFramework();

        String getStatus();

        String getOperations();
    }
}
