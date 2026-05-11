package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServiceBackend;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.service.ServiceBackendService;
import com.aibizarchitect.nexus.v1.dto.DeploymentWithBackendsDto;
import com.aibizarchitect.nexus.v1.dto.ServiceBackendDto;

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
@RequestMapping("/api/v1/backends")
@CrossOrigin(origins = "*")
public class ServiceBackendController {

    private static final Logger log = LoggerFactory.getLogger(ServiceBackendController.class);

    private final ServiceBackendService serviceBackendService;

    public ServiceBackendController(ServiceBackendService serviceBackendService) {
        this.serviceBackendService = serviceBackendService;
    }
    
    /**
     * Get all backends for a specific deployment
     * 
     * Example: GET /api/backends/deployment/123
     * Returns: List of backends that deployment 123 uses
     */
    @GetMapping("/deployment/{deploymentId}")
    public ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<ServiceBackendDto>> getBackendsForDeployment(
            @PathVariable Long deploymentId,
            org.springframework.data.domain.Pageable pageable) {
        log.info("Fetching backends for deployment id: {}", deploymentId);
        List<ServiceBackendDto> backends = serviceBackendService.getBackendsForDeployment(deploymentId);
        log.debug("Found {} backends for deployment {}", backends.size(), deploymentId);
        int start = (int) pageable.getOffset();
        int end = Math.min((start + pageable.getPageSize()), backends.size());
        org.springframework.data.domain.Page<ServiceBackendDto> page = new org.springframework.data.domain.PageImpl<>(
                (start <= end) ? backends.subList(start, end) : java.util.Collections.emptyList(),
                pageable, backends.size());
        return ResponseEntity.ok(com.aibizarchitect.nexus.v1.spring.serviceregistry.dto.SpringPagedResponse.fromPage(page));
    }

    /**
     * Get all consumers (services using this deployment as a backend)
     *
     * Example: GET /api/backends/consumers/123
     * Returns: List of services that use deployment 123 as a backend
     */
    @GetMapping("/consumers/{deploymentId}")
    public ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<ServiceBackendDto>> getConsumersForDeployment(
            @PathVariable Long deploymentId,
            org.springframework.data.domain.Pageable pageable) {
        log.info("Fetching consumers for deployment id: {}", deploymentId);
        List<ServiceBackendDto> consumers = serviceBackendService.getConsumersForDeployment(deploymentId);
        log.debug("Found {} consumers for deployment {}", consumers.size(), deploymentId);
        int start = (int) pageable.getOffset();
        int end = Math.min((start + pageable.getPageSize()), consumers.size());
        org.springframework.data.domain.Page<ServiceBackendDto> page = new org.springframework.data.domain.PageImpl<>(
                (start <= end) ? consumers.subList(start, end) : java.util.Collections.emptyList(),
                pageable, consumers.size());
        return ResponseEntity.ok(com.aibizarchitect.nexus.v1.spring.serviceregistry.dto.SpringPagedResponse.fromPage(page));
    }

    /**
     * Get deployment with all backend connections
     *
     * Example: GET /api/backends/deployment/123/details
     * Returns: Deployment info + backends + consumers
     */
    @GetMapping("/deployment/{deploymentId}/details")
    public ResponseEntity<DeploymentWithBackendsDto> getDeploymentWithBackends(@PathVariable Long deploymentId) {
        log.info("Fetching deployment details with backends for deployment id: {}", deploymentId);
        DeploymentWithBackendsDto dto = serviceBackendService.getDeploymentWithBackends(deploymentId);
        log.debug("Retrieved deployment details for deployment {}", deploymentId);
        return ResponseEntity.ok(dto);
    }

    /**
     * Add a backend connection
     *
     * Example: POST /api/backends
     * Body: {
     *   "serviceDeploymentId": 123,
     *   "backendDeploymentId": 456,
     *   "role": "PRIMARY",
     *   "priority": 1
     * }
     */
    @PostMapping
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
        java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(backend.getId())
                .toUri();
        return ResponseEntity.created(location).body(backend);
    }

    /**
     * Update backend configuration
     *
     * Example: PUT /api/backends/789
     * Body: {
     *   "role": "BACKUP",
     *   "priority": 2,
     *   "isActive": true
     * }
     */
    @PutMapping("/{backendId}")
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
     * Example: DELETE /api/backends/789
     */
    @DeleteMapping("/{backendId}")
    public ResponseEntity<Void> removeBackend(@PathVariable Long backendId) {
        log.info("Removing backend id: {}", backendId);
        serviceBackendService.removeBackend(backendId);
        log.debug("Successfully removed backend id: {}", backendId);
        return ResponseEntity.noContent().build();
    }
}
