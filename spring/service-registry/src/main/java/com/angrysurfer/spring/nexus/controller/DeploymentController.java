package com.angrysurfer.spring.nexus.controller;

import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.angrysurfer.spring.nexus.client.ServicesConsoleClient;
import com.angrysurfer.spring.nexus.entity.Deployment;
import com.angrysurfer.spring.nexus.entity.Service;
import com.angrysurfer.spring.nexus.repository.DeploymentRepository;
import com.angrysurfer.spring.nexus.repository.ServiceRepository;

@RestController
@RequestMapping("/api/deployments")
@CrossOrigin(origins = "*")
public class DeploymentController {

    private static final Logger log = LoggerFactory.getLogger(DeploymentController.class);
    private final ServicesConsoleClient client;
    private final DeploymentRepository deploymentRepository;
    private final ServiceRepository serviceRepository;

    public DeploymentController(ServicesConsoleClient client, DeploymentRepository deploymentRepository,
            ServiceRepository serviceRepository) {
        this.client = client;
        this.deploymentRepository = deploymentRepository;
        this.serviceRepository = serviceRepository;
    }

    @GetMapping
    public List<Deployment> getAllDeployments() {
        log.info("Fetching all deployments from database");
        return deploymentRepository.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Deployment> getDeploymentById(@PathVariable Long id) {
        log.info("Fetching deployment by id: {}", id);
        return deploymentRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/service/{serviceId}")
    public List<Deployment> getDeploymentsByService(@PathVariable Long serviceId) {
        log.info("Fetching deployments for service: {}", serviceId);
        return deploymentRepository.findByService_Id(serviceId);
    }

    @PostMapping
    public ResponseEntity<Deployment> createDeployment(@RequestBody Deployment deployment) {
        log.info("Creating new deployment");

        // Set active flag
        deployment.setActiveFlag(true);

        Deployment savedDeployment = deploymentRepository.save(deployment);
        log.info("Successfully created deployment with ID: {}", savedDeployment.getId());

        // Check if this service has sub-modules and deploy them automatically
        if (deployment.getService() != null) {
            List<Service> subModules = serviceRepository.findByParentService_Id(deployment.getService().getId());
            if (!subModules.isEmpty()) {
                log.info("Service {} has {} sub-modules, creating deployments for them", deployment.getService().getId(),
                        subModules.size());
                for (Service subModule : subModules) {
                    Deployment subDeployment = new Deployment();
                    subDeployment.setService(subModule);
                    subDeployment.setServer(deployment.getServer());
                    subDeployment.setEnvironment(deployment.getEnvironment());
                    subDeployment.setVersion(deployment.getVersion());
                    subDeployment.setStatus(deployment.getStatus());
                    subDeployment.setPort(deployment.getPort()); // Sub-modules share the same port (bundled)
                    subDeployment.setContextPath(deployment.getContextPath());
                    subDeployment.setHealthCheckUrl(deployment.getHealthCheckUrl());
                    subDeployment.setHealthStatus(deployment.getHealthStatus());
                    subDeployment.setActiveFlag(true);

                    Deployment savedSubDeployment = deploymentRepository.save(subDeployment);
                    log.info("Created sub-module deployment for service {} with ID: {}", subModule.getName(),
                            savedSubDeployment.getId());
                }
            }
        }

        return ResponseEntity.ok(savedDeployment);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Deployment> updateDeployment(@PathVariable Long id, @RequestBody Deployment deployment) {
        log.info("Updating deployment with ID: {}", id);

        Optional<Deployment> existingDeploymentOpt = deploymentRepository.findById(id);
        if (existingDeploymentOpt.isEmpty()) {
            log.warn("Deployment with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        // Update the deployment
        deployment.setId(id);
        Deployment updatedDeployment = deploymentRepository.save(deployment);
        log.info("Successfully updated deployment with ID: {}", id);
        return ResponseEntity.ok(updatedDeployment);
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<Deployment> updateDeploymentStatus(@PathVariable Long id, @RequestParam String status) {
        log.info("Updating deployment {} status to: {}", id, status);

        Optional<Deployment> deploymentOpt = deploymentRepository.findById(id);
        if (deploymentOpt.isEmpty()) {
            log.warn("Deployment with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        Deployment deployment = deploymentOpt.get();
        deployment.setStatus(status);
        Deployment updatedDeployment = deploymentRepository.save(deployment);
        log.info("Successfully updated deployment status");
        return ResponseEntity.ok(updatedDeployment);
    }

    @PatchMapping("/{id}/health")
    public ResponseEntity<Deployment> updateDeploymentHealth(@PathVariable Long id, @RequestParam String healthStatus) {
        log.info("Updating deployment {} health to: {}", id, healthStatus);

        Optional<Deployment> deploymentOpt = deploymentRepository.findById(id);
        if (deploymentOpt.isEmpty()) {
            log.warn("Deployment with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        Deployment deployment = deploymentOpt.get();
        deployment.setHealthStatus(healthStatus);
        Deployment updatedDeployment = deploymentRepository.save(deployment);
        log.info("Successfully updated deployment health status");
        return ResponseEntity.ok(updatedDeployment);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteDeployment(@PathVariable Long id) {
        log.info("Deleting deployment with ID: {}", id);

        Optional<Deployment> deploymentOpt = deploymentRepository.findById(id);
        if (deploymentOpt.isEmpty()) {
            log.warn("Deployment with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        Deployment deployment = deploymentOpt.get();

        // Check if this service has sub-modules and delete their deployments
        if (deployment.getService() != null) {
            List<Service> subModules = serviceRepository.findByParentService_Id(deployment.getService().getId());
            if (!subModules.isEmpty()) {
                log.info("Service {} has {} sub-modules, deleting their deployments", deployment.getService().getId(),
                        subModules.size());
                for (Service subModule : subModules) {
                    List<Deployment> subDeployments = deploymentRepository.findByService_Id(subModule.getId());
                    for (Deployment subDeployment : subDeployments) {
                        // Only delete sub-deployments on the same server
                        if (subDeployment.getServer() != null && subDeployment.getServer().equals(deployment.getServer())) {
                            deploymentRepository.deleteById(subDeployment.getId());
                            log.info("Deleted sub-module deployment for service {} with ID: {}", subModule.getName(),
                                    subDeployment.getId());
                        }
                    }
                }
            }
        }

        deploymentRepository.deleteById(id);
        log.info("Successfully deleted deployment with ID: {}", id);
        return ResponseEntity.noContent().build();
    }
}
