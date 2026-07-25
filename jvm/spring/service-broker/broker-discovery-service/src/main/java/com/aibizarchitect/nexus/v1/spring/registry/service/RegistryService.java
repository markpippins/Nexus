package com.aibizarchitect.nexus.v1.spring.registry.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.broker.api.ServiceRegistration;
import com.aibizarchitect.nexus.v1.broker.api.ServiceRegistration.ServiceStatus;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerOperation;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerParam;

@Service("serviceRegistry")
public class RegistryService {
    
    private static final Logger log = LoggerFactory.getLogger(RegistryService.class);
    
    // Map: serviceName -> ServiceRegistration
    private final Map<String, ServiceRegistration> registry = new ConcurrentHashMap<>();
    
    // Map: operation -> serviceName (for quick lookup)
    private final Map<String, String> operationIndex = new ConcurrentHashMap<>();
    
    @BrokerOperation("register")
    public Map<String, String> register(@BrokerParam("registration") ServiceRegistration registration) {
        // Null guard on registration object
        if (registration == null) {
            log.warn("Register called with null registration");
            return Map.of("error", "Registration cannot be null");
        }

        String serviceName = registration.getServiceName();
        // Null/blank guard on service name (ConcurrentHashMap rejects null keys)
        if (serviceName == null || serviceName.isBlank()) {
            log.warn("Register called with null or blank service name");
            return Map.of("error", "Service name is required");
        }

        log.info("Registering service: {}", serviceName);
        log.debug("Registration details - Service: {}, Operations: {}, Endpoint: {}",
                 serviceName, registration.getOperations(), registration.getEndpoint());

        // Clean stale operations from index before overwriting
        ServiceRegistration old = registry.get(serviceName);
        if (old != null && old.getOperations() != null) {
            for (String op : old.getOperations()) {
                operationIndex.remove(op);
            }
            log.debug("Cleaned {} stale operations from index for service: {}",
                    old.getOperations().size(), serviceName);
        }

        registration.setLastHeartbeat(Instant.now());
        registration.setStatus(ServiceStatus.HEALTHY);

        // Store in registry
        registry.put(serviceName, registration);

        // Index operations (guard against null list)
        List<String> operations = registration.getOperations();
        if (operations != null) {
            for (String operation : operations) {
                operationIndex.put(operation, serviceName);
            }
        }

        log.info("Successfully registered service: {} with {} operations",
                serviceName, operations != null ? operations.size() : 0);

        return Map.of(
            "message", "Service registered successfully",
            "serviceName", serviceName
        );
    }
    
    @BrokerOperation("findByServiceName")
    public ServiceRegistration findByServiceName(@BrokerParam("serviceName") String serviceName) {
        // Null/blank guard — ConcurrentHashMap.get(null) throws NPE
        if (serviceName == null || serviceName.isBlank()) {
            log.warn("findByServiceName called with null or blank service name");
            return null;
        }
        log.debug("Finding service by name: {}", serviceName);
        ServiceRegistration registration = registry.get(serviceName);
        if (registration != null) {
            log.debug("Service found: {}", serviceName);
        } else {
            log.warn("Service not found: {}", serviceName);
        }
        return registration;
    }
    
    @BrokerOperation("findByOperation")
    public ServiceRegistration findByOperation(@BrokerParam("operation") String operation) {
        // Null/blank guard — operationIndex.get(null) throws NPE
        if (operation == null || operation.isBlank()) {
            log.warn("findByOperation called with null or blank operation");
            return null;
        }
        log.debug("Finding service by operation: {}", operation);
        String serviceName = operationIndex.get(operation);
        if (serviceName != null) {
            log.debug("Found service name {} for operation: {}", serviceName, operation);
            ServiceRegistration registration = registry.get(serviceName);
            if (registration != null) {
                log.debug("Service found for operation {}: {}", operation, serviceName);
                return registration;
            } else {
                log.warn("Service registration not found in registry for service name: {}", serviceName);
                return null;
            }
        } else {
            log.warn("No service found for operation: {}", operation);
        }
        return null;
    }
    
    @BrokerOperation("getAllServices")
    public List<ServiceRegistration> getAllServices() {
        log.debug("Fetching all registered services");
        List<ServiceRegistration> services = List.copyOf(registry.values());
        log.info("Returning {} registered services", services.size());
        return services;
    }
    
    @BrokerOperation("deregister")
    public Map<String, String> deregister(@BrokerParam("serviceName") String serviceName) {
        // Null/blank guard — ConcurrentHashMap.remove(null) throws NPE
        if (serviceName == null || serviceName.isBlank()) {
            log.warn("Deregister called with null or blank service name");
            return Map.of("message", "Service not found");
        }
        log.info("Deregistering service: {}", serviceName);
        ServiceRegistration registration = registry.remove(serviceName);
        if (registration != null) {
            // Remove from operation index
            for (String operation : registration.getOperations()) {
                operationIndex.remove(operation);
            }
            log.info("Successfully deregistered service: {} with {} operations",
                    serviceName, registration.getOperations().size());
            return Map.of("message", "Service deregistered successfully");
        } else {
            log.warn("Service not found for deregistration: {}", serviceName);
            return Map.of("message", "Service not found");
        }
    }
    
    @BrokerOperation("heartbeat")
    public Map<String, String> heartbeat(@BrokerParam("serviceName") String serviceName) {
        // Null/blank guard — ConcurrentHashMap.get(null) throws NPE
        if (serviceName == null || serviceName.isBlank()) {
            log.warn("Heartbeat called with null or blank service name");
            return Map.of("message", "Service not found");
        }
        log.debug("Processing heartbeat for service: {}", serviceName);
        ServiceRegistration registration = registry.get(serviceName);
        if (registration != null) {
            registration.setLastHeartbeat(Instant.now());
            registration.setStatus(ServiceStatus.HEALTHY);
            log.info("Heartbeat received and updated for service: {}", serviceName);
            return Map.of("message", "Heartbeat received");
        } else {
            log.warn("Service not found for heartbeat update: {}", serviceName);
            return Map.of("message", "Service not found");
        }
    }
    
    // Internal method for broker-gateway to query registry
    public Optional<ServiceRegistration> lookupByOperation(String operation) {
        // Null/blank guard — operationIndex.get(null) throws NPE
        if (operation == null || operation.isBlank()) {
            log.warn("lookupByOperation called with null or blank operation");
            return Optional.empty();
        }
        log.debug("Looking up service by operation: {}", operation);
        String serviceName = operationIndex.get(operation);
        if (serviceName != null) {
            log.debug("Found service name {} for operation: {}", serviceName, operation);
            Optional<ServiceRegistration> result = Optional.ofNullable(registry.get(serviceName));
            if (result.isPresent()) {
                log.debug("Service registration found for operation: {}", operation);
            } else {
                log.warn("Service registration not found in registry for service name: {}", serviceName);
            }
            return result;
        } else {
            log.warn("No service found in operation index for operation: {}", operation);
        }
        return Optional.empty();
    }
    
    public void markUnhealthy(String serviceName) {
        // Null/blank guard — ConcurrentHashMap.get(null) throws NPE
        if (serviceName == null || serviceName.isBlank()) {
            log.warn("markUnhealthy called with null or blank service name");
            return;
        }
        log.info("Marking service as unhealthy: {}", serviceName);
        ServiceRegistration registration = registry.get(serviceName);
        if (registration != null) {
            registration.setStatus(ServiceStatus.UNHEALTHY);
            log.warn("Successfully marked service as unhealthy: {} - Current status: {}",
                    serviceName, registration.getStatus());
        } else {
            log.warn("Service not found to mark as unhealthy: {}", serviceName);
        }
    }
}
