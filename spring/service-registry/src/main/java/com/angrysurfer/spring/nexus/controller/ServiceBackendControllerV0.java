package com.angrysurfer.spring.nexus.controller;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.angrysurfer.spring.nexus.dto.DeploymentWithBackendsDto;
import com.angrysurfer.spring.nexus.dto.ServiceBackendDto;
import com.angrysurfer.spring.nexus.entity.ServiceBackend;
import com.angrysurfer.spring.nexus.service.ServiceBackendService;

/**
 * REST API for managing service backend connections
 *
 * Endpoints for the Angular admin console to:
 * - View backend connections for a deployment
 * - Add/remove backend connections
 * - Configure backend roles (PRIMARY, BACKUP, etc.)
 * - View which services consume a backend
 */
@RestController
@RequestMapping("/api/v0/backends")
@CrossOrigin(origins = "*")
@Deprecated(since = "v1", forRemoval = true)
public class ServiceBackendControllerV0 {

    private static final Logger log = LoggerFactory.getLogger(ServiceBackendControllerV0.class);

    @Autowired
    private ServiceBackendService serviceBackendService;

    /**
     * Get all backends for a specific deployment
     *
     * Example: GET /api/v0/backends/deployment/123
     * Returns: List of backends that deployment 123 uses
     */
    @GetMapping("/deployment/{deploymentId}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<List<ServiceBackendDto>> getBackendsForDeployment(@PathVariable Long deploymentId) {
        log.info("Fetching backends for deployment id: {}", deploymentId);
        List<ServiceBackendDto> backends = serviceBackendService.getBackendsForDeployment(deploymentId);
        log.debug("Found {} backends for deployment {}", backends.size(), deploymentId);
        return ResponseEntity.ok(backends);
    }

    /**
     * Get all consumers (services using this deployment as a backend)
     *
     * Example: GET /api/v0/backends/consumers/123
     * Returns: List of services that use deployment 123 as a backend
     */
    @GetMapping("/consumers/{deploymentId}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<List<ServiceBackendDto>> getConsumersForDeployment(@PathVariable Long deploymentId) {
        log.info("Fetching consumers for deployment id: {}", deploymentId);
        List<ServiceBackendDto> consumers = serviceBackendService.getConsumersForDeployment(deploymentId);
        log.debug("Found {} consumers for deployment {}", consumers.size(), deploymentId);
        return ResponseEntity.ok(consumers);
    }

    /**
     * Get deployment with all backend connections
     *
     * Example: GET /api/v0/backends/deployment/123/details
     * Returns: Deployment info + backends + consumers
     */
    @GetMapping("/deployment/{deploymentId}/details")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<DeploymentWithBackendsDto> getDeploymentWithBackends(@PathVariable Long deploymentId) {
        log.info("Fetching deployment details with backends for deployment id: {}", deploymentId);
        DeploymentWithBackendsDto dto = serviceBackendService.getDeploymentWithBackends(deploymentId);
        log.debug("Retrieved deployment details for deployment {}", deploymentId);
        return ResponseEntity.ok(dto);
    }

    /**
     * Add a backend connection
     *
     * Example: POST /api/v0/backends
     * Body: {
     *   "serviceDeploymentId": 123,
     *   "backendDeploymentId": 456,
     *   "role": "PRIMARY",
     *   "priority": 1
     * }
     */
    @PostMapping
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<ServiceBackend> addBackend(@RequestBody Map<String, Object> request) {
        log.info("Adding backend connection from request: {}", request);
        Long serviceDeploymentId = Long.valueOf(request.get("serviceDeploymentId").toString());
        Long backendDeploymentId = Long.valueOf(request.get("backendDeploymentId").toString());
        ServiceBackend.BackendRole role = ServiceBackend.BackendRole.valueOf(
            request.getOrDefault("role", "PRIMARY").toString()
        );
        Integer priority = request.containsKey("priority") ?
            Integer.valueOf(request.get("priority").toString()) : 1;

        ServiceBackend backend = serviceBackendService.addBackend(
            serviceDeploymentId, backendDeploymentId, role, priority
        );

        log.debug("Created backend connection with id: {}, service: {}, backend: {}, role: {}",
            backend.getId(), serviceDeploymentId, backendDeploymentId, role);
        return new ResponseEntity<>(backend, HttpStatus.CREATED);
    }

    /**
     * Update backend configuration
     *
     * Example: PUT /api/v0/backends/789
     * Body: {
     *   "role": "BACKUP",
     *   "priority": 2,
     *   "isActive": true
     * }
     */
    @PutMapping("/{backendId}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<ServiceBackend> updateBackend(
            @PathVariable Long backendId,
            @RequestBody ServiceBackendDto dto) {
        log.info("Updating backend id: {} with data: {}", backendId, dto);
        ServiceBackend updated = serviceBackendService.updateBackend(backendId, dto);
        log.debug("Successfully updated backend id: {}", backendId);
        return ResponseEntity.ok(updated);
    }

    /**
     * Remove a backend connection
     *
     * Example: DELETE /api/v0/backends/789
     */
    @DeleteMapping("/{backendId}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<Void> removeBackend(@PathVariable Long backendId) {
        log.info("Removing backend id: {}", backendId);
        serviceBackendService.removeBackend(backendId);
        log.debug("Successfully removed backend id: {}", backendId);
        return ResponseEntity.noContent().build();
    }
}
