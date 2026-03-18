package com.angrysurfer.spring.nexus.dto;

import com.angrysurfer.spring.nexus.entity.ServiceBackend;

/**
 * DTO for ServiceBackend entity
 * Used for API requests/responses
 */
public class ServiceBackendDto {
    private Long id;
    private Long serviceDeploymentId;
    private Long backendDeploymentId;
    private ServiceBackend.BackendRole role;
    private Integer priority;
    private String routingKey;
    private Integer weight;
    private Boolean isActive;
    private String description;

    // Enriched data for frontend
    private String serviceDeploymentName; // "file-service (localhost:8084)"
    private String backendDeploymentName; // "file-system-server (localhost:4040)"
    private String backendStatus; // "HEALTHY", "UNHEALTHY", "UNKNOWN"

    public ServiceBackendDto() {
    }

    public ServiceBackendDto(Long id, Long serviceDeploymentId, Long backendDeploymentId,
            ServiceBackend.BackendRole role, Integer priority, String routingKey, Integer weight, Boolean isActive,
            String description, String serviceDeploymentName, String backendDeploymentName, String backendStatus) {
        this.id = id;
        this.serviceDeploymentId = serviceDeploymentId;
        this.backendDeploymentId = backendDeploymentId;
        this.role = role;
        this.priority = priority;
        this.routingKey = routingKey;
        this.weight = weight;
        this.isActive = isActive;
        this.description = description;
        this.serviceDeploymentName = serviceDeploymentName;
        this.backendDeploymentName = backendDeploymentName;
        this.backendStatus = backendStatus;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getServiceDeploymentId() {
        return serviceDeploymentId;
    }

    public void setServiceDeploymentId(Long serviceDeploymentId) {
        this.serviceDeploymentId = serviceDeploymentId;
    }

    public Long getBackendDeploymentId() {
        return backendDeploymentId;
    }

    public void setBackendDeploymentId(Long backendDeploymentId) {
        this.backendDeploymentId = backendDeploymentId;
    }

    public ServiceBackend.BackendRole getRole() {
        return role;
    }

    public void setRole(ServiceBackend.BackendRole role) {
        this.role = role;
    }

    public Integer getPriority() {
        return priority;
    }

    public void setPriority(Integer priority) {
        this.priority = priority;
    }

    public String getRoutingKey() {
        return routingKey;
    }

    public void setRoutingKey(String routingKey) {
        this.routingKey = routingKey;
    }

    public Integer getWeight() {
        return weight;
    }

    public void setWeight(Integer weight) {
        this.weight = weight;
    }

    public Boolean getIsActive() {
        return isActive;
    }

    public void setIsActive(Boolean isActive) {
        this.isActive = isActive;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getServiceDeploymentName() {
        return serviceDeploymentName;
    }

    public void setServiceDeploymentName(String serviceDeploymentName) {
        this.serviceDeploymentName = serviceDeploymentName;
    }

    public String getBackendDeploymentName() {
        return backendDeploymentName;
    }

    public void setBackendDeploymentName(String backendDeploymentName) {
        this.backendDeploymentName = backendDeploymentName;
    }

    public String getBackendStatus() {
        return backendStatus;
    }

    public void setBackendStatus(String backendStatus) {
        this.backendStatus = backendStatus;
    }
}
