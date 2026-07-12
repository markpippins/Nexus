package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

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
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.DeploymentRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServerRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceRepository;

@RestController
@RequestMapping("/api/v1/deployments")
public class DeploymentController {

    private static final Logger log = LoggerFactory.getLogger(DeploymentController.class);

    private final DeploymentRepository deploymentRepository;
    private final ServiceRepository serviceRepository;
    private final ServerRepository serverRepository;

    public DeploymentController(DeploymentRepository deploymentRepository,
            ServiceRepository serviceRepository,
            ServerRepository serverRepository) {
        this.deploymentRepository = deploymentRepository;
        this.serviceRepository = serviceRepository;
        this.serverRepository = serverRepository;
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
