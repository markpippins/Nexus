package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Deployment;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.StatusEvent;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.DeploymentRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServerRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.StatusEventRepository;

@RestController
@RequestMapping("/api/v1/deployments")
public class DeploymentController {

    private static final Logger log = LoggerFactory.getLogger(DeploymentController.class);

    private final DeploymentRepository deploymentRepository;
    private final ServiceRepository serviceRepository;
    private final ServerRepository serverRepository;
    private final StatusEventRepository statusEventRepository;

    public DeploymentController(DeploymentRepository deploymentRepository,
            ServiceRepository serviceRepository,
            ServerRepository serverRepository,
            StatusEventRepository statusEventRepository) {
        this.deploymentRepository = deploymentRepository;
        this.serviceRepository = serviceRepository;
        this.serverRepository = serverRepository;
        this.statusEventRepository = statusEventRepository;
    }

    @GetMapping
    public ResponseEntity<?> getDeployments(
            @RequestParam(required = false) Long serviceId,
            org.springframework.data.domain.Pageable pageable) {
        if (serviceId != null) {
            log.info("Fetching deployments for service ID: {}", serviceId);
            return ResponseEntity.ok(deploymentRepository.findByServiceId(serviceId));
        }
        log.info("Fetching all deployments from database");
        return ResponseEntity.ok(com.aibizarchitect.nexus.v1.spring.serviceregistry.dto.SpringPagedResponse.fromPage(
                deploymentRepository.findAll(pageable)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Deployment> getDeploymentById(@PathVariable Long id) {
        log.info("Fetching deployment by ID: {}", id);
        return deploymentRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // ================================================================
    // Lifecycle operations (D-BP-1 ref 6938f85a): start / stop / restart
    //   - Idempotent: repeating the operation while already in (or heading
    //     toward) the target state is a 200 no-op, never an error.
    //   - Invalid transitions are rejected with 409 CONFLICT (no state change).
    //   - Transitions are recorded via the shared StatusEvent history model
    //     (the same surface ServiceStatusController uses), NOT a parallel
    //     state machine — history stays queryable via /api/v1/status/*.
    // ================================================================

    /**
     * Start a deployment. Idempotent when already RUNNING/STARTING.
     * Rejects 409 when the deployment is STOPPING (a stop is in flight).
     */
    @PostMapping("/{id}/start")
    public ResponseEntity<?> startDeployment(@PathVariable Long id) {
        Optional<Deployment> opt = deploymentRepository.findById(id);
        if (opt.isEmpty()) {
            log.warn("Deployment with ID {} not found for start", id);
            return ResponseEntity.notFound().build();
        }
        Deployment dep = opt.get();
        Deployment.DeploymentStatus current = dep.getStatusEnum();

        if (current == Deployment.DeploymentStatus.STOPPING) {
            return conflict("start", dep);
        }
        if (current == Deployment.DeploymentStatus.RUNNING
                || current == Deployment.DeploymentStatus.STARTING) {
            return ResponseEntity.ok(operationResult(dep, false, "already-running"));
        }

        String from = stateName(dep);
        dep.setStatus(Deployment.DeploymentStatus.RUNNING.name());
        dep.setStartedAt(java.time.LocalDateTime.now());
        dep.setStoppedAt(null);
        dep.setActiveFlag(true);
        Deployment saved = deploymentRepository.save(dep);
        recordTransition(dep, from, "deployment.start");
        log.info("Started deployment with ID: {}", id);
        return ResponseEntity.ok(operationResult(saved, true, "started"));
    }

    /**
     * Stop a deployment. Idempotent when already STOPPED/STOPPING.
     * Rejects 409 when the deployment is STARTING (a start is in flight).
     */
    @PostMapping("/{id}/stop")
    public ResponseEntity<?> stopDeployment(@PathVariable Long id) {
        Optional<Deployment> opt = deploymentRepository.findById(id);
        if (opt.isEmpty()) {
            log.warn("Deployment with ID {} not found for stop", id);
            return ResponseEntity.notFound().build();
        }
        Deployment dep = opt.get();
        Deployment.DeploymentStatus current = dep.getStatusEnum();

        if (current == Deployment.DeploymentStatus.STARTING) {
            return conflict("stop", dep);
        }
        if (current == Deployment.DeploymentStatus.STOPPED
                || current == Deployment.DeploymentStatus.STOPPING) {
            return ResponseEntity.ok(operationResult(dep, false, "already-stopped"));
        }

        String from = stateName(dep);
        dep.setStatus(Deployment.DeploymentStatus.STOPPED.name());
        dep.setStoppedAt(java.time.LocalDateTime.now());
        dep.setStartedAt(null);
        dep.setActiveFlag(false);
        Deployment saved = deploymentRepository.save(dep);
        recordTransition(dep, from, "deployment.stop");
        log.info("Stopped deployment with ID: {}", id);
        return ResponseEntity.ok(operationResult(saved, true, "stopped"));
    }

    /**
     * Restart a deployment — expressed as a stop → start composition.
     * If the stop leg rejects (409, e.g. start in flight), the conflict
     * propagates and no restart occurs.
     */
    @PostMapping("/{id}/restart")
    public ResponseEntity<?> restartDeployment(@PathVariable Long id) {
        log.info("Restarting deployment with ID: {}", id);
        ResponseEntity<?> stop = stopDeployment(id);
        if (stop.getStatusCode().isError()) {
            return stop;
        }
        return startDeployment(id);
    }

    private ResponseEntity<?> conflict(String operation, Deployment dep) {
        return ResponseEntity.status(org.springframework.http.HttpStatus.CONFLICT)
                .body(java.util.Map.of(
                        "error", "invalid-transition",
                        "operation", operation,
                        "currentStatus", stateName(dep)));
    }

    private Map<String, Object> operationResult(Deployment dep, boolean changed, String message) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("deploymentId", dep.getId());
        m.put("status", stateName(dep));
        m.put("changed", changed);
        m.put("message", message);
        return m;
    }

    private String stateName(Deployment dep) {
        Deployment.DeploymentStatus s = dep.getStatusEnum();
        return s != null ? s.name() : "UNKNOWN";
    }

    private void recordTransition(Deployment dep, String from, String reason) {
        try {
            String serviceName = dep.getService() != null
                    ? dep.getService().getName()
                    : "deployment-" + dep.getId();
            statusEventRepository.save(new StatusEvent(
                    serviceName, from, stateName(dep), reason, null, null));
        } catch (Exception e) {
            log.warn("Failed to record status transition for deployment {}: {}",
                    dep.getId(), e.getMessage());
        }
    }

    @PostMapping
    public ResponseEntity<Deployment> createDeployment(@RequestBody Deployment deployment) {
        log.info("Creating new deployment");

        // Validate service exists
        if (deployment.getService() != null && deployment.getService().getId() != null) {
            var serviceOpt = serviceRepository.findById(deployment.getService().getId());
            if (serviceOpt.isEmpty()) {
                log.warn("Service with ID {} not found", deployment.getService().getId());
                return ResponseEntity.badRequest().build();
            }
            deployment.setService(serviceOpt.get());
        }

        // Validate server exists
        if (deployment.getServer() != null && deployment.getServer().getId() != null) {
            var serverOpt = serverRepository.findById(deployment.getServer().getId());
            if (serverOpt.isEmpty()) {
                log.warn("Server with ID {} not found", deployment.getServer().getId());
                return ResponseEntity.badRequest().build();
            }
            deployment.setServer(serverOpt.get());
        }

        deployment.setActiveFlag(true);
        Deployment saved = deploymentRepository.save(deployment);
        log.info("Successfully created deployment with ID: {}", saved.getId());
        java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(saved.getId())
                .toUri();
        return ResponseEntity.created(location).body(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Deployment> updateDeployment(@PathVariable Long id, @RequestBody Deployment deployment) {
        log.info("Updating deployment with ID: {}", id);

        Optional<Deployment> existingOpt = deploymentRepository.findById(id);
        if (existingOpt.isEmpty()) {
            log.warn("Deployment with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        deployment.setId(id);
        Deployment updated = deploymentRepository.save(deployment);
        log.info("Successfully updated deployment with ID: {}", id);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteDeployment(@PathVariable Long id) {
        log.info("Deleting deployment with ID: {}", id);

        Optional<Deployment> deploymentOpt = deploymentRepository.findById(id);
        if (deploymentOpt.isEmpty()) {
            log.warn("Deployment with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        deploymentRepository.deleteById(id);
        log.info("Successfully deleted deployment with ID: {}", id);
        return ResponseEntity.noContent().build();
    }
}
