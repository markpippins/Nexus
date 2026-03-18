package com.angrysurfer.spring.nexus.service;

import java.util.List;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.angrysurfer.spring.nexus.dto.DeploymentWithBackendsDto;
import com.angrysurfer.spring.nexus.dto.ServiceBackendDto;
import com.angrysurfer.spring.nexus.entity.Deployment;
import com.angrysurfer.spring.nexus.entity.ServiceBackend;
import com.angrysurfer.spring.nexus.repository.DeploymentRepository;
import com.angrysurfer.spring.nexus.repository.ServiceBackendRepository;

@Service
public class ServiceBackendService {
    
    private static final Logger log = LoggerFactory.getLogger(ServiceBackendService.class);
    
    @Autowired
    private ServiceBackendRepository serviceBackendRepository;
    
    @Autowired
    private DeploymentRepository deploymentRepository;
    
    /**
     * Get all backends for a deployment
     */
    public List<ServiceBackendDto> getBackendsForDeployment(Long deploymentId) {
        log.info("Getting backends for deployment: {}", deploymentId);
        List<ServiceBackend> backends = serviceBackendRepository.findByServiceDeploymentId(deploymentId);
        List<ServiceBackendDto> result = backends.stream()
                .map(this::toDto)
                .collect(Collectors.toList());
        log.debug("Found {} backends for deployment {}", result.size(), deploymentId);
        return result;
    }

    /**
     * Get all consumers (services using this deployment as a backend)
     */
    public List<ServiceBackendDto> getConsumersForDeployment(Long deploymentId) {
        log.info("Getting consumers for deployment: {}", deploymentId);
        List<ServiceBackend> consumers = serviceBackendRepository.findByBackendDeploymentId(deploymentId);
        List<ServiceBackendDto> result = consumers.stream()
                .map(this::toDto)
                .collect(Collectors.toList());
        log.debug("Found {} consumers for deployment {}", result.size(), deploymentId);
        return result;
    }
    
    /**
     * Get deployment with all its backend connections
     */
    public DeploymentWithBackendsDto getDeploymentWithBackends(Long deploymentId) {
        log.info("Getting deployment with backends: {}", deploymentId);
        Deployment deployment = deploymentRepository.findById(deploymentId)
                .orElseThrow(() -> new RuntimeException("Deployment not found: " + deploymentId));

        DeploymentWithBackendsDto dto = new DeploymentWithBackendsDto();
        dto.setId(deployment.getId());
        // We need to fetch the actual service and server names for display
        // For now, use the IDs as placeholders
        dto.setServiceName("Service-" + deployment.getServiceId());
        dto.setServerHostname("Server-" + deployment.getServerId());
        dto.setPort(deployment.getPort());
        dto.setVersion(deployment.getVersion());
        dto.setStatus(deployment.getStatus());
        dto.setEnvironment("Env-" + deployment.getEnvironmentId());

        dto.setBackends(getBackendsForDeployment(deploymentId));
        dto.setConsumers(getConsumersForDeployment(deploymentId));

        log.debug("Completed getting deployment with backends: {}", deploymentId);
        return dto;
    }

    /**
     * Add a backend connection
     */
@Transactional
    public ServiceBackend addBackend(Long serviceDeploymentId, Long backendDeploymentId,
                                     ServiceBackend.BackendRole role, Integer priority) {
        // Verify that deployments exist
        deploymentRepository.findById(serviceDeploymentId)
                .orElseThrow(() -> new RuntimeException("Service deployment not found: " + serviceDeploymentId));

        deploymentRepository.findById(backendDeploymentId)
                .orElseThrow(() -> new RuntimeException("Backend deployment not found: " + backendDeploymentId));

        ServiceBackend backend = new ServiceBackend();
        backend.setServiceDeploymentId(serviceDeploymentId);
        backend.setBackendDeploymentId(backendDeploymentId);
        backend.setRole(role);
        backend.setPriority(priority != null ? priority : 1);
        backend.setIsActive(true);

        ServiceBackend saved = serviceBackendRepository.save(backend);

        log.info("Added backend connection: {} -> {}",
                serviceDeploymentId, backendDeploymentId);

        return saved;
    }
    
    /**
     * Remove a backend connection
     */
    @Transactional
    public void removeBackend(Long backendId) {
        serviceBackendRepository.deleteById(backendId);
        log.info("Removed backend connection: {}", backendId);
    }

    /**
     * Update backend configuration
     */
    @Transactional
    public ServiceBackend updateBackend(Long backendId, ServiceBackendDto dto) {
        log.info("Updating backend: {}", backendId);
        ServiceBackend backend = serviceBackendRepository.findById(backendId)
                .orElseThrow(() -> new RuntimeException("Backend not found: " + backendId));

        if (dto.getRole() != null) {
            backend.setRole(dto.getRole());
        }
        if (dto.getPriority() != null) {
            backend.setPriority(dto.getPriority());
        }
        if (dto.getRoutingKey() != null) {
            backend.setRoutingKey(dto.getRoutingKey());
        }
        if (dto.getWeight() != null) {
            backend.setWeight(dto.getWeight());
        }
        if (dto.getIsActive() != null) {
            backend.setIsActive(dto.getIsActive());
        }
        if (dto.getDescription() != null) {
            backend.setDescription(dto.getDescription());
        }

        ServiceBackend saved = serviceBackendRepository.save(backend);
        log.info("Updated backend: {}", backendId);
        return saved;
    }
    
    /**
     * Convert entity to DTO
     */
    private ServiceBackendDto toDto(ServiceBackend backend) {
        ServiceBackendDto dto = new ServiceBackendDto();
        dto.setId(backend.getId());
        dto.setServiceDeploymentId(backend.getServiceDeploymentId());
        dto.setBackendDeploymentId(backend.getBackendDeploymentId());
        dto.setRole(backend.getRole());
        dto.setPriority(backend.getPriority());
        dto.setRoutingKey(backend.getRoutingKey());
        dto.setWeight(backend.getWeight());
        dto.setIsActive(backend.getIsActive());
        dto.setDescription(backend.getDescription());

        // Enriched data - we'll need to fetch the deployments to get the names
        // For now, we'll just use placeholder IDs as names
        dto.setServiceDeploymentName("Deployment-" + backend.getServiceDeploymentId());
        dto.setBackendDeploymentName("Deployment-" + backend.getBackendDeploymentId());
        dto.setBackendStatus("UNKNOWN"); // Placeholder

        return dto;
    }
}
