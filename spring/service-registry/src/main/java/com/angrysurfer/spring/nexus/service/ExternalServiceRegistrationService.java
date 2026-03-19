package com.angrysurfer.spring.nexus.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.angrysurfer.nexus.dto.ExternalServiceRegistration;
import com.angrysurfer.spring.nexus.entity.Framework;
import com.angrysurfer.spring.nexus.entity.ServiceConfiguration;
import com.angrysurfer.spring.nexus.entity.ServiceType;
import com.angrysurfer.spring.nexus.repository.FrameworkRepository;
import com.angrysurfer.spring.nexus.repository.ServiceConfigurationRepository;
import com.angrysurfer.spring.nexus.repository.ServiceRepository;
import com.angrysurfer.spring.nexus.repository.ServiceTypeRepository;

@Service
public class ExternalServiceRegistrationService {

    private static final Logger log = LoggerFactory.getLogger(ExternalServiceRegistrationService.class);

    @Autowired
    private ServiceRepository serviceRepository;

    @Autowired
    private FrameworkRepository frameworkRepository;

    @Autowired
    private ServiceTypeRepository serviceTypeRepository;

    @Autowired
    private ServiceConfigurationRepository serviceConfigurationRepository;

    @Transactional
    public com.angrysurfer.spring.nexus.entity.Service registerExternalService(
            ExternalServiceRegistration registration) {

        log.info("Registering external service: {}", registration.getServiceName());
        log.debug("Registration details: version={}, endpoint={}, port={}, healthCheck={}",
                registration.getVersion(), registration.getEndpoint(), registration.getPort(),
                registration.getHealthCheck());

        com.angrysurfer.spring.nexus.entity.Service service = serviceRepository
                .findByName(registration.getServiceName())
                .orElse(new com.angrysurfer.spring.nexus.entity.Service());

        service.setName(registration.getServiceName());
        service.setDescription("External service registered via API");
        service.setVersion(registration.getVersion());
        service.setHealthCheckPath(registration.getHealthCheck());
        service.setApiBasePath(registration.getEndpoint());
        service.setDefaultPort(registration.getPort());
        service.setStatus("ACTIVE");

        if (registration.getFramework() != null) {
            log.debug("Looking up framework: {}", registration.getFramework());
            Optional<Framework> framework = frameworkRepository.findByName(registration.getFramework());
            if (framework.isPresent()) {
                service.setFrameworkId(framework.get().getId());
                log.debug("Framework found and assigned: {}", framework.get().getName());
            } else {
                log.warn("Framework not found: {}. Creating new framework.", registration.getFramework());
                Framework newFramework = new Framework();
                newFramework.setName(registration.getFramework());
                newFramework.setDescription("Auto-generated framework for " + registration.getFramework());
                newFramework.setActiveFlag(true); // Assuming default to active
                newFramework.setCreatedAt(LocalDateTime.now());
                newFramework.setUpdatedAt(LocalDateTime.now());
                newFramework.setVendorId(1L); // Default vendor ID
                newFramework.setCategoryId(1L); // Default category ID
                newFramework.setLanguageId(1L); // Default language ID
                framework = Optional.of(frameworkRepository.save(newFramework));
                service.setFrameworkId(framework.get().getId());
                log.debug("New framework created and assigned: {}", framework.get().getName());
            }
        }

        ServiceType serviceType = serviceTypeRepository.findByName("REST_API")
                .orElseGet(() -> {
                    log.debug("Creating default REST_API service type");
                    ServiceType newType = new ServiceType();
                    newType.setName("REST_API");
                    newType.setDescription("REST API Service");
                    return serviceTypeRepository.save(newType);
                });
        service.setServiceTypeId(serviceType.getId());
        log.debug("Assigned service type: {}", serviceType.getName());

        service = serviceRepository.save(service);
        log.debug("Service saved with ID: {}", service.getId());

        if (registration.getOperations() != null && !registration.getOperations().isEmpty()) {
            log.debug("Storing {} operations for service: {}", registration.getOperations().size(), service.getName());
            storeOperations(service, registration.getOperations());
        } else {
            log.debug("No operations to store for service: {}", service.getName());
        }

        if (registration.getMetadata() != null && !registration.getMetadata().isEmpty()) {
            log.debug("Storing metadata for service: {}", service.getName());
            storeMetadata(service, registration.getMetadata());
        } else {
            log.debug("No metadata to store for service: {}", service.getName());
        }

        if (registration.getHostedServices() != null && !registration.getHostedServices().isEmpty()) {
            log.debug("Storing {} hosted services for service: {}", registration.getHostedServices().size(),
                    service.getName());
            storeHostedServices(service, registration.getHostedServices());
        } else {
            log.debug("No hosted services to store for service: {}", service.getName());
        }

        if (registration.getDependencies() != null && !registration.getDependencies().isEmpty()) {
            log.debug("Processing dependencies for service: {}", service.getName());
            storeDependencies(service, registration.getDependencies());
        }

        log.info("Successfully registered service: {} with ID: {}", service.getName(), service.getId());

        return service;
    }

    private void storeDependencies(com.angrysurfer.spring.nexus.entity.Service service,
            List<String> dependencyNames) {
        log.debug("Storing dependencies for service: {}", service.getName());

        // With the new entity structure, dependencies are handled differently
        // The Service entity no longer has a direct dependencies collection
        // Dependencies are now handled through the ServiceDependency entity
        log.warn("Dependency storage not implemented in new entity structure");
    }

    private void storeOperations(com.angrysurfer.spring.nexus.entity.Service service,
            List<String> operations) {
        log.debug("Storing operations for service: {} - Operations: {}", service.getName(), operations);
        String operationsStr = String.join(",", operations);

        ServiceConfiguration config = serviceConfigurationRepository
                .findByServiceAndConfigKey(service, "operations")
                .orElse(new ServiceConfiguration());

        config.setServiceId(service.getId());
        config.setConfigKey("operations");
        config.setConfigValue(operationsStr);
        config.setEnvironmentId(1L); // Default environment ID
        config.setConfigTypeId(1L); // Default config type ID
        config.setDescription("Supported operations");

        ServiceConfiguration savedConfig = serviceConfigurationRepository.save(config);
        log.debug("Stored operations configuration with ID: {} for service: {}", savedConfig.getId(),
                service.getName());
    }

    private void storeMetadata(com.angrysurfer.spring.nexus.entity.Service service,
            java.util.Map<String, Object> metadata) {
        log.debug("Storing {} metadata entries for service: {}", metadata.size(), service.getName());
        for (java.util.Map.Entry<String, Object> entry : metadata.entrySet()) {
            log.debug("Processing metadata: {}={}", entry.getKey(), entry.getValue());
            ServiceConfiguration config = serviceConfigurationRepository
                    .findByServiceAndConfigKey(service, "metadata." + entry.getKey())
                    .orElse(new ServiceConfiguration());

            config.setServiceId(service.getId());
            config.setConfigKey("metadata." + entry.getKey());
            config.setConfigValue(entry.getValue().toString());
            config.setEnvironmentId(1L); // Default environment ID
            config.setConfigTypeId(1L); // Default config type ID
            config.setDescription("Metadata: " + entry.getKey());

            ServiceConfiguration savedConfig = serviceConfigurationRepository.save(config);
            log.debug("Stored metadata configuration with ID: {} for key: {}", savedConfig.getId(), entry.getKey());
        }
    }

    private void storeHostedServices(com.angrysurfer.spring.nexus.entity.Service service,
            java.util.List<ExternalServiceRegistration.HostedServiceInfo> hostedServices) {
        log.debug("Storing hosted services for service: {}", service.getName());

        StringBuilder hostedServicesJson = new StringBuilder("[");
        for (int i = 0; i < hostedServices.size(); i++) {
            ExternalServiceRegistration.HostedServiceInfo info = hostedServices.get(i);
            if (i > 0)
                hostedServicesJson.append(",");
            hostedServicesJson.append("{\"serviceName\":\"").append(info.getServiceName()).append("\",");
            hostedServicesJson.append("\"framework\":\"")
                    .append(info.getFramework() != null ? info.getFramework() : "unknown").append("\",");
            hostedServicesJson.append("\"status\":\"").append(info.getStatus() != null ? info.getStatus() : "HEALTHY")
                    .append("\",");
            hostedServicesJson.append("\"type\":\"").append(info.getType() != null ? info.getType() : "embedded")
                    .append("\",");
            hostedServicesJson.append("\"endpoint\":\"").append(info.getEndpoint() != null ? info.getEndpoint() : "")
                    .append("\",");
            hostedServicesJson.append("\"healthCheck\":\"")
                    .append(info.getHealthCheck() != null ? info.getHealthCheck() : "").append("\",");
            hostedServicesJson.append("\"operations\":[");
            if (info.getOperations() != null) {
                for (int j = 0; j < info.getOperations().size(); j++) {
                    if (j > 0)
                        hostedServicesJson.append(",");
                    hostedServicesJson.append("\"").append(info.getOperations().get(j)).append("\"");
                }
            }
            hostedServicesJson.append("]}");
        }
        hostedServicesJson.append("]");

        ServiceConfiguration config = serviceConfigurationRepository
                .findByServiceAndConfigKey(service, "hostedServices")
                .orElse(new ServiceConfiguration());

        config.setServiceId(service.getId());
        config.setConfigKey("hostedServices");
        config.setConfigValue(hostedServicesJson.toString());
        config.setEnvironmentId(1L); // Default environment ID
        config.setConfigTypeId(1L); // Default config type ID
        config.setDescription("Hosted services within this gateway");

        ServiceConfiguration savedConfig = serviceConfigurationRepository.save(config);
        log.debug("Stored hosted services configuration with ID: {} for service: {}", savedConfig.getId(),
                service.getName());
    }

    @Transactional
    public boolean updateHeartbeat(String serviceName) {
        log.debug("Updating heartbeat for service: {}", serviceName);
        Optional<com.angrysurfer.spring.nexus.entity.Service> serviceOpt = serviceRepository
                .findByName(serviceName);

        if (serviceOpt.isPresent()) {
            com.angrysurfer.spring.nexus.entity.Service service = serviceOpt.get();
            log.debug("Service found with ID: {} for heartbeat update", service.getId());

            ServiceConfiguration heartbeatConfig = serviceConfigurationRepository
                    .findByServiceAndConfigKey(service, "lastHeartbeat")
                    .orElse(new ServiceConfiguration());

            heartbeatConfig.setServiceId(service.getId());
            heartbeatConfig.setConfigKey("lastHeartbeat");
            heartbeatConfig.setConfigValue(LocalDateTime.now().toString());
            heartbeatConfig.setEnvironmentId(1L); // Default environment ID
            heartbeatConfig.setConfigTypeId(1L); // Default config type ID
            heartbeatConfig.setDescription("Last heartbeat timestamp");

            ServiceConfiguration savedConfig = serviceConfigurationRepository.save(heartbeatConfig);
            log.info("Updated heartbeat for service: {} with configuration ID: {}", serviceName, savedConfig.getId());
            return true;
        }

        log.warn("Service not found for heartbeat update: {}", serviceName);
        return false;
    }

    public List<com.angrysurfer.spring.nexus.entity.Service> getAllActiveServices() {
        return serviceRepository.findByStatus("ACTIVE");
    }

    public Optional<com.angrysurfer.spring.nexus.entity.Service> findServiceByOperation(String operation) {
        log.debug("Finding service by operation: {}", operation);
        List<ServiceConfiguration> configs = serviceConfigurationRepository.findByConfigKey("operations");
        log.debug("Found {} operation configurations to search", configs.size());

        for (ServiceConfiguration config : configs) {
            String operations = config.getConfigValue();
            if (operations != null && operations.contains(operation)) {
                log.debug("Found service ID {} for operation: {}", config.getServiceId(), operation);
                Optional<com.angrysurfer.spring.nexus.entity.Service> serviceOpt = serviceRepository
                        .findById(config.getServiceId());
                return serviceOpt;
            }
        }

        log.warn("No service found for operation: {}", operation);
        return Optional.empty();
    }

    public Optional<Map<String, Object>> getServiceDetails(String serviceName) {
        log.debug("Getting service details for: {}", serviceName);
        Optional<com.angrysurfer.spring.nexus.entity.Service> serviceOpt = serviceRepository
                .findByName(serviceName);

        if (serviceOpt.isPresent()) {
            com.angrysurfer.spring.nexus.entity.Service service = serviceOpt.get();

            // Build the service URL
            String baseUrl = service.getApiBasePath();
            if (!baseUrl.startsWith("http")) {
                baseUrl = "http://" + baseUrl;
            }
            if (service.getDefaultPort() != null && !baseUrl.contains(":")) {
                baseUrl += ":" + service.getDefaultPort();
            }

            // Get operations if available
            Optional<String> operationsOpt = serviceConfigurationRepository
                    .findByServiceAndConfigKey(service, "operations")
                    .map(ServiceConfiguration::getConfigValue);

            // Get framework details if available
            String frameworkName = "unknown";
            if (service.getFrameworkId() != null) {
                Optional<Framework> frameworkOpt = frameworkRepository.findById(service.getFrameworkId());
                if (frameworkOpt.isPresent()) {
                    frameworkName = frameworkOpt.get().getName();
                }
            }

            Map<String, Object> details = Map.of(
                    "serviceName", service.getName(),
                    "endpoint", baseUrl,
                    "healthCheck", service.getHealthCheckPath(),
                    "framework", frameworkName,
                    "status", service.getStatus(),
                    "operations", operationsOpt.orElse(""));

            log.debug("Returning details for service: {} with endpoint: {}", serviceName, baseUrl);
            return Optional.of(details);
        }

        log.warn("Service not found for details: {}", serviceName);
        return Optional.empty();
    }

    @Transactional
    public boolean deregisterService(String serviceName) {
        log.info("Deregistering service: {}", serviceName);
        Optional<com.angrysurfer.spring.nexus.entity.Service> serviceOpt = serviceRepository
                .findByName(serviceName);

        if (serviceOpt.isPresent()) {
            com.angrysurfer.spring.nexus.entity.Service service = serviceOpt.get();
            log.debug("Service found with ID: {} for deregistration", service.getId());
            service.setStatus("ARCHIVED");
            serviceRepository.save(service);

            log.info("Successfully deregistered service: {} with ID: {}", serviceName, service.getId());
            return true;
        }

        log.warn("Service not found for deregistration: {}", serviceName);
        return false;
    }

    /**
     * Get all services with their hosted/embedded services.
     * Returns a list of service maps, each including a 'hostedServices' array.
     */
    public List<Map<String, Object>> getAllServicesWithHosted() {
        log.debug("Fetching all services with hosted services");
        List<com.angrysurfer.spring.nexus.entity.Service> services = serviceRepository.findByStatus("ACTIVE");
        List<Map<String, Object>> result = new java.util.ArrayList<>();

        for (com.angrysurfer.spring.nexus.entity.Service service : services) {
            Map<String, Object> serviceMap = new java.util.HashMap<>();
            serviceMap.put("id", service.getId());
            serviceMap.put("name", service.getName());
            serviceMap.put("description", service.getDescription());
            serviceMap.put("status", service.getStatus());
            serviceMap.put("endpoint", service.getApiBasePath());
            serviceMap.put("defaultPort", service.getDefaultPort());
            serviceMap.put("version", service.getVersion());

            // Get framework name
            if (service.getFrameworkId() != null) {
                frameworkRepository.findById(service.getFrameworkId())
                        .ifPresent(f -> serviceMap.put("framework", f.getName()));
            }

            // Get operations
            serviceConfigurationRepository.findByServiceAndConfigKey(service, "operations")
                    .ifPresent(config -> serviceMap.put("operations", config.getConfigValue()));

            // Get last heartbeat
            serviceConfigurationRepository.findByServiceAndConfigKey(service, "lastHeartbeat")
                    .ifPresent(config -> serviceMap.put("lastHeartbeat", config.getConfigValue()));

            // Get hosted services
            serviceConfigurationRepository.findByServiceAndConfigKey(service, "hostedServices")
                    .ifPresent(config -> {
                        try {
                            // Parse the JSON array of hosted services
                            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                            List<Map<String, Object>> hostedServices = mapper.readValue(
                                    config.getConfigValue(),
                                    mapper.getTypeFactory().constructCollectionType(List.class, Map.class));
                            serviceMap.put("hostedServices", hostedServices);
                        } catch (Exception e) {
                            log.warn("Failed to parse hosted services JSON for service: {}", service.getName(), e);
                            serviceMap.put("hostedServices", java.util.Collections.emptyList());
                        }
                    });

            result.add(serviceMap);
        }

        log.debug("Returning {} services with hosted services", result.size());
        return result;
    }

    /**
     * Get hosted services for a specific parent service.
     */
    public Optional<List<Map<String, Object>>> getHostedServicesForService(String serviceName) {
        log.debug("Fetching hosted services for: {}", serviceName);
        Optional<com.angrysurfer.spring.nexus.entity.Service> serviceOpt = serviceRepository
                .findByName(serviceName);

        if (serviceOpt.isPresent()) {
            com.angrysurfer.spring.nexus.entity.Service service = serviceOpt.get();

            Optional<ServiceConfiguration> configOpt = serviceConfigurationRepository
                    .findByServiceAndConfigKey(service, "hostedServices");

            if (configOpt.isPresent()) {
                try {
                    com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                    List<Map<String, Object>> hostedServices = mapper.readValue(
                            configOpt.get().getConfigValue(),
                            mapper.getTypeFactory().constructCollectionType(List.class, Map.class));
                    log.debug("Found {} hosted services for: {}", hostedServices.size(), serviceName);
                    return Optional.of(hostedServices);
                } catch (Exception e) {
                    log.warn("Failed to parse hosted services JSON for service: {}", serviceName, e);
                    return Optional.of(java.util.Collections.emptyList());
                }
            }

            log.debug("No hosted services configuration found for: {}", serviceName);
            return Optional.of(java.util.Collections.emptyList());
        }

        log.warn("Service not found: {}", serviceName);
        return Optional.empty();
    }
}
