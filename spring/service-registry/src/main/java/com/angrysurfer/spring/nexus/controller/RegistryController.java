package com.angrysurfer.spring.nexus.controller;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.angrysurfer.spring.nexus.dto.ExternalServiceRegistration;
import com.angrysurfer.spring.nexus.entity.Service;
import com.angrysurfer.spring.nexus.repository.ServiceRepository;
import com.angrysurfer.spring.nexus.service.ExternalServiceRegistrationService;
import com.angrysurfer.spring.nexus.service.ServiceStatusCacheService;

@RestController
@RequestMapping("/api/registry")
@CrossOrigin(origins = "*")
public class RegistryController {

    private static final Logger log = LoggerFactory.getLogger(RegistryController.class);

    @Autowired
    private ExternalServiceRegistrationService registrationService;

    @Autowired
    private ServiceStatusCacheService cacheService;

    @Autowired
    private ServiceRepository serviceRepository;

    /**
     * Register an external service (e.g., Moleculer, Python, Go services)
     */
    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@RequestBody ExternalServiceRegistration registration) {
        log.info("Received registration request for service: {}", registration.getServiceName());

        try {
            Service service = registrationService.registerExternalService(registration);

            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "Service registered successfully",
                    "serviceName", service.getName(),
                    "serviceId", service.getId()));
        } catch (Exception e) {
            log.error("Failed to register service: {}", registration.getServiceName(), e);
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "Failed to register service: " + e.getMessage()));
        }
    }

    /**
     * Heartbeat endpoint for external services to maintain registration.
     * Updates both database and Redis cache.
     */
    @PostMapping("/heartbeat/{serviceName}")
    public ResponseEntity<Map<String, String>> heartbeat(@PathVariable String serviceName) {
        log.debug("Received heartbeat from service: {}", serviceName);

        boolean updated = registrationService.updateHeartbeat(serviceName);

        if (updated) {
            // Also update Redis cache for real-time access
            serviceRepository.findByName(serviceName)
                    .ifPresent(service -> cacheService.recordHeartbeat(serviceName, service.getId()));

            return ResponseEntity.ok(Map.of(
                    "message", "Heartbeat received",
                    "serviceName", serviceName));
        } else {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Get all registered services (for broker-gateway to query)
     */
    @GetMapping("/services")
    public ResponseEntity<List<Service>> getAllRegisteredServices() {
        List<Service> services = registrationService.getAllActiveServices();
        return ResponseEntity.ok(services);
    }

    /**
     * Get all services with their hosted/embedded services.
     * This is the primary endpoint for the service mesh UI.
     */
    @GetMapping("/services/with-hosted")
    public ResponseEntity<List<Map<String, Object>>> getAllServicesWithHosted() {
        log.debug("Fetching all services with hosted services");
        List<Map<String, Object>> servicesWithHosted = registrationService.getAllServicesWithHosted();
        return ResponseEntity.ok(servicesWithHosted);
    }

    /**
     * Get hosted services for a specific parent service.
     */
    @GetMapping("/services/{serviceName}/hosted")
    public ResponseEntity<List<Map<String, Object>>> getHostedServices(@PathVariable String serviceName) {
        log.debug("Fetching hosted services for: {}", serviceName);
        return registrationService.getHostedServicesForService(serviceName)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Find service by operation name (for broker-gateway routing)
     */
    @GetMapping("/services/by-operation/{operation}")
    public ResponseEntity<Service> findServiceByOperation(@PathVariable String operation) {
        return registrationService.findServiceByOperation(operation)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Get service details with endpoint URL for direct calls
     */
    @GetMapping("/services/{serviceName}/details")
    public ResponseEntity<Map<String, Object>> getServiceDetails(@PathVariable String serviceName) {
        return registrationService.getServiceDetails(serviceName)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Deregister a service
     */
    @PostMapping("/deregister/{serviceName}")
    public ResponseEntity<Map<String, String>> deregister(@PathVariable String serviceName) {
        log.info("Deregistering service: {}", serviceName);

        boolean removed = registrationService.deregisterService(serviceName);

        if (removed) {
            return ResponseEntity.ok(Map.of(
                    "message", "Service deregistered successfully",
                    "serviceName", serviceName));
        } else {
            return ResponseEntity.notFound().build();
        }
    }
}
