package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aibizarchitect.nexus.v1.dto.ExternalServiceRegistration;
import com.aibizarchitect.nexus.v1.dto.HeartbeatPayload;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.service.ExternalServiceRegistrationService;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.service.ServiceStatusCacheService;

@RestController
@RequestMapping("/api/v1/registry")
public class RegistryController {

    private static final Logger log = LoggerFactory.getLogger(RegistryController.class);

    private final ExternalServiceRegistrationService registrationService;
    private final ServiceStatusCacheService cacheService;
    private final ServiceRepository serviceRepository;

    public RegistryController(ExternalServiceRegistrationService registrationService,
                              ServiceStatusCacheService cacheService,
                              ServiceRepository serviceRepository) {
        this.registrationService = registrationService;
        this.cacheService = cacheService;
        this.serviceRepository = serviceRepository;
    }

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
     *
     * Accepts an optional body with rich metadata:
     * {
     *   "version": "1.2.3",
     *   "build": "abc123",
     *   "metrics": { "memoryMb": 256, "cpuPercent": 12.5 }
     * }
     *
     * Backward-compatible: POST with no body still works (legacy heartbeat).
     */
    @PostMapping("/heartbeat/{serviceName}")
    public ResponseEntity<Map<String, String>> heartbeat(
            @PathVariable String serviceName,
            @RequestBody(required = false) HeartbeatPayload payload) {
        log.debug("Received heartbeat from service: {} (rich={})", serviceName, payload != null);

        boolean updated = registrationService.updateHeartbeat(serviceName);

        if (updated) {
            serviceRepository.findByName(serviceName).ifPresent(service -> {
                if (payload != null && (payload.getMetrics() != null || payload.getVersion() != null)) {
                    // Rich heartbeat — store metrics alongside
                    cacheService.recordHeartbeatRich(serviceName, service.getId(),
                            payload.getVersion(), payload.getBuild(), payload.getMetrics());
                } else {
                    // Legacy heartbeat
                    cacheService.recordHeartbeat(serviceName, service.getId());
                }
            });

            return ResponseEntity.ok(Map.of(
                    "message", "Heartbeat received",
                    "serviceName", serviceName));
        } else {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Batch heartbeat endpoint for agent processes running multiple services.
     *
     * POST /api/v1/registry/heartbeat/batch
     * {
     *   "services": [
     *     { "name": "conduit-mcp", "version": "1.0.0", "metrics": {...} },
     *     { "name": "nebula-mcp", "version": "1.0.0" }
     *   ]
     * }
     *
     * Returns results for each service, including any that were not found.
     */
    @PostMapping("/heartbeat/batch")
    public ResponseEntity<Map<String, Object>> batchHeartbeat(
            @RequestBody BatchHeartbeatRequest request) {
        if (request.getServices() == null || request.getServices().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Empty services list"));
        }

        List<Map<String, Object>> results = new ArrayList<>();
        int succeeded = 0;
        int failed = 0;

        for (HeartbeatEntry entry : request.getServices()) {
            String name = entry.getName();
            if (name == null || name.isBlank()) {
                results.add(Map.of("name", "null", "success", false, "error", "missing name"));
                failed++;
                continue;
            }

            boolean updated = registrationService.updateHeartbeat(name);
            if (updated) {
                serviceRepository.findByName(name).ifPresent(service -> {
                    if (entry.getMetrics() != null || entry.getVersion() != null) {
                        cacheService.recordHeartbeatRich(name, service.getId(),
                                entry.getVersion(), entry.getBuild(), entry.getMetrics());
                    } else {
                        cacheService.recordHeartbeat(name, service.getId());
                    }
                });
                results.add(Map.of("name", name, "success", true));
                succeeded++;
            } else {
                results.add(Map.of("name", name, "success", false, "error", "service not found"));
                failed++;
            }
        }

        return ResponseEntity.ok(Map.of(
                "succeeded", succeeded,
                "failed", failed,
                "results", results));
    }

    /**
     * Graceful shutdown — immediately marks service OFFLINE and emits a
     * goodbye event, rather than waiting for the 90s stale timeout.
     *
     * Services should call this on SIGTERM for clean shutdown.
     */
    @PostMapping("/deregister/{serviceName}/graceful")
    public ResponseEntity<Map<String, String>> gracefulDeregister(@PathVariable String serviceName) {
        log.info("Graceful deregister for service: {}", serviceName);

        // Remove from DB registration
        boolean removed = registrationService.deregisterService(serviceName);

        // Remove from Redis cache and publish goodbye event
        cacheService.gracefulShutdown(serviceName);

        return ResponseEntity.ok(Map.of(
                "message", "Service gracefully deregistered",
                "serviceName", serviceName,
                "removed", String.valueOf(removed)));
    }

    /**
     * Get all registered services (for broker-gateway to query)
     */
    @GetMapping("/services")
    public ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<Service>> getAllRegisteredServices(org.springframework.data.domain.Pageable pageable) {
        List<Service> services = registrationService.getAllActiveServices();
        int start = (int) pageable.getOffset();
        int end = Math.min((start + pageable.getPageSize()), services.size());
        org.springframework.data.domain.Page<Service> page = new org.springframework.data.domain.PageImpl<>(
                (start <= end) ? services.subList(start, end) : java.util.Collections.emptyList(),
                pageable, services.size());
        return ResponseEntity.ok(com.aibizarchitect.nexus.v1.spring.serviceregistry.dto.SpringPagedResponse.fromPage(page));
    }

    /**
     * Get all services with their hosted/embedded services.
     * This is the primary endpoint for the service mesh UI.
     */
    @GetMapping("/services/with-hosted")
    public ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<Map<String, Object>>> getAllServicesWithHosted(org.springframework.data.domain.Pageable pageable) {
        log.debug("Fetching all services with hosted services");
        List<Map<String, Object>> servicesWithHosted = registrationService.getAllServicesWithHosted();
        int start = (int) pageable.getOffset();
        int end = Math.min((start + pageable.getPageSize()), servicesWithHosted.size());
        org.springframework.data.domain.Page<Map<String, Object>> page = new org.springframework.data.domain.PageImpl<>(
                (start <= end) ? servicesWithHosted.subList(start, end) : java.util.Collections.emptyList(),
                pageable, servicesWithHosted.size());
        return ResponseEntity.ok(com.aibizarchitect.nexus.v1.spring.serviceregistry.dto.SpringPagedResponse.fromPage(page));
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

    // --- Maintenance mode admin endpoints ---

    /**
     * Set a service into maintenance mode.
     * The service will be forced into the specified state (OFFLINE or DEGRADE)
     * and will remain there until maintenance mode is cleared, regardless of
     * heartbeat status.
     *
     * POST /api/v1/registry/admin/maintenance/{serviceName}
     * { "targetState": "OFFLINE", "reason": "Planned maintenance" }
     */
    @PostMapping("/admin/maintenance/{serviceName}")
    public ResponseEntity<Map<String, String>> setMaintenanceMode(
            @PathVariable String serviceName,
            @RequestBody Map<String, String> body) {
        String targetState = body.getOrDefault("targetState", "OFFLINE");
        String reason = body.getOrDefault("reason", "maintenance");

        // Validate target state
        if (!"OFFLINE".equals(targetState) && !"DEGRADED".equals(targetState)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "targetState must be OFFLINE or DEGRADED"));
        }

        log.info("Setting maintenance mode for {}: state={}", serviceName, targetState);
        cacheService.setMaintenanceMode(serviceName, targetState, reason);

        return ResponseEntity.ok(Map.of(
                "message", "Maintenance mode enabled",
                "serviceName", serviceName,
                "targetState", targetState,
                "reason", reason));
    }

    /**
     * Clear maintenance mode for a service.
     * The next heartbeat will restore the service to its actual state.
     *
     * DELETE /api/v1/registry/admin/maintenance/{serviceName}
     */
    @org.springframework.web.bind.annotation.DeleteMapping("/admin/maintenance/{serviceName}")
    public ResponseEntity<Map<String, String>> clearMaintenanceMode(@PathVariable String serviceName) {
        if (!cacheService.isMaintenanceMode(serviceName)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Service is not in maintenance mode"));
        }

        log.info("Clearing maintenance mode for {}", serviceName);
        cacheService.clearMaintenanceMode(serviceName);

        return ResponseEntity.ok(Map.of(
                "message", "Maintenance mode cleared",
                "serviceName", serviceName));
    }

    /**
     * List all services currently in maintenance mode.
     *
     * GET /api/v1/registry/admin/maintenance
     */
    @GetMapping("/admin/maintenance")
    public ResponseEntity<Map<String, String>> listMaintenanceMode() {
        return ResponseEntity.ok(cacheService.getAllMaintenanceMode());
    }

    // --- Inner classes for batch heartbeat request ---

    public static class BatchHeartbeatRequest {
        private List<HeartbeatEntry> services;

        public List<HeartbeatEntry> getServices() { return services; }
        public void setServices(List<HeartbeatEntry> services) { this.services = services; }
    }

    public static class HeartbeatEntry {
        private String name;
        private String version;
        private String build;
        private Map<String, Object> metrics;

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getVersion() { return version; }
        public void setVersion(String version) { this.version = version; }

        public String getBuild() { return build; }
        public void setBuild(String build) { this.build = build; }

        public Map<String, Object> getMetrics() { return metrics; }
        public void setMetrics(Map<String, Object> metrics) { this.metrics = metrics; }
    }
}
