package com.aibizarchitect.nexus.v1.spring.broker.gateway.service;

import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient;

@Service
public class ServiceDiscoveryClientImpl implements ServiceDiscoveryClient {

    private static final Logger log = LoggerFactory.getLogger(ServiceDiscoveryClientImpl.class);

    @Value("${service.registry.url:http://localhost:8085}")
    private final String hostServerUrl;

    private final RestTemplate restTemplate;

    public ServiceDiscoveryClientImpl(@Value("${service.registry.url:http://localhost:8085}") String hostServerUrl,
                                      RestTemplate restTemplate) {
        this.hostServerUrl = hostServerUrl;
        this.restTemplate = restTemplate;
    }

    @Override
    public Optional<ServiceInfo> findServiceByOperation(String operation) {
        log.debug("Looking for service to handle operation: {}", operation);

        try {
            String url = hostServerUrl + "/api/v1/registry/services/by-operation/" + operation;
            log.debug("Querying service registry at: {}", url);

            ServiceInfoImpl serviceInfo = restTemplate.getForObject(url, ServiceInfoImpl.class);
            if (serviceInfo != null) {
                log.info("Found service {} for operation: {}", serviceInfo.getName(), operation);
                return Optional.of(serviceInfo);
            }
        } catch (Exception e) {
            log.error("Failed to find service for operation: {}", operation, e);
        }

        log.warn("No service found for operation: {}", operation);
        return Optional.empty();
    }

    @Override
    public Optional<ServiceDetails> getServiceDetails(String serviceName) {
        log.debug("Getting details for service: {}", serviceName);

        try {
            String url = hostServerUrl + "/api/v1/registry/services/" + serviceName + "/details";
            log.debug("Querying service details at: {}", url);

            ServiceDetailsImpl details = restTemplate.getForObject(url, ServiceDetailsImpl.class);
            if (details != null) {
                log.debug("Retrieved details for service: {} with endpoint: {}", serviceName, details.getEndpoint());
                return Optional.of(details);
            }
        } catch (Exception e) {
            log.error("Failed to get details for service: {}", serviceName, e);
        }

        log.warn("No details found for service: {}", serviceName);
        return Optional.empty();
    }

    /**
     * Implementation of ServiceInfo interface
     */
    public static class ServiceInfoImpl implements ServiceInfo {
        private Long id;
        private String name;
        private String description;
        private String status;

        @Override
        public Long getId() {
            return id;
        }

        public void setId(Long id) {
            this.id = id;
        }

        @Override
        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        @Override
        public String getDescription() {
            return description;
        }

        public void setDescription(String description) {
            this.description = description;
        }

        @Override
        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }
    }

    /**
     * Implementation of ServiceDetails interface
     */
    public static class ServiceDetailsImpl implements ServiceDetails {
        private String serviceName;
        private String endpoint;
        private String healthCheck;
        private String framework;
        private String status;
        private String operations;

        @Override
        public String getServiceName() {
            return serviceName;
        }

        public void setServiceName(String serviceName) {
            this.serviceName = serviceName;
        }

        @Override
        public String getEndpoint() {
            return endpoint;
        }

        public void setEndpoint(String endpoint) {
            this.endpoint = endpoint;
        }

        @Override
        public String getHealthCheck() {
            return healthCheck;
        }

        public void setHealthCheck(String healthCheck) {
            this.healthCheck = healthCheck;
        }

        @Override
        public String getFramework() {
            return framework;
        }

        public void setFramework(String framework) {
            this.framework = framework;
        }

        @Override
        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }

        @Override
        public String getOperations() {
            return operations;
        }

        public void setOperations(String operations) {
            this.operations = operations;
        }
    }
}
