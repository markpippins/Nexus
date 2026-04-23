package com.aibizarchitect.nexus.v1.spring.serviceregistry.entity;

import java.time.LocalDateTime;
import java.util.Objects;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "deployments")
@JsonIgnoreProperties({ "service.deployments", "service.configurations", "service.dependents", "server.deployments" })
public class Deployment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "service_id")
    private Service service;

    @ManyToOne(optional = false)
    @JoinColumn(name = "environment_id")
    private EnvironmentType environment;

    @ManyToOne(optional = false)
    @JoinColumn(name = "server_id")
    private Host server;

    @Column
    private String version;

    @Column(name = "deployed_at")
    private LocalDateTime deployedAt;

    @Column
    private String status;

    @Column
    private Integer port;

    @Column(name = "context_path")
    private String contextPath;

    @Column(name = "health_check_url")
    private String healthCheckUrl;

    @Column(name = "health_status")
    private String healthStatus;

    @Column(name = "last_health_check")
    private LocalDateTime lastHealthCheck;

    @Column(name = "process_id")
    private String processId;

    @Column(name = "container_name")
    private String containerName;

    @Column(name = "deployment_path")
    private String deploymentPath;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "stopped_at")
    private LocalDateTime stoppedAt;

    @Column(name = "active_flag")
    private Boolean activeFlag = true;

    @Column
    private LocalDateTime createdAt;

    @Column
    private LocalDateTime updatedAt;

    public Deployment() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Service getService() {
        return service;
    }

    public void setService(Service service) {
        this.service = service;
    }

    public EnvironmentType getEnvironment() {
        return environment;
    }

    public void setEnvironment(EnvironmentType environment) {
        this.environment = environment;
    }

    public Host getServer() {
        return server;
    }

    public void setServer(Host server) {
        this.server = server;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public LocalDateTime getDeployedAt() {
        return deployedAt;
    }

    public void setDeployedAt(LocalDateTime deployedAt) {
        this.deployedAt = deployedAt;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Integer getPort() {
        return port;
    }

    public void setPort(Integer port) {
        this.port = port;
    }

    public String getContextPath() {
        return contextPath;
    }

    public void setContextPath(String contextPath) {
        this.contextPath = contextPath;
    }

    public String getHealthCheckUrl() {
        return healthCheckUrl;
    }

    public void setHealthCheckUrl(String healthCheckUrl) {
        this.healthCheckUrl = healthCheckUrl;
    }

    public String getHealthStatus() {
        return healthStatus;
    }

    public void setHealthStatus(String healthStatus) {
        this.healthStatus = healthStatus;
    }

    public LocalDateTime getLastHealthCheck() {
        return lastHealthCheck;
    }

    public void setLastHealthCheck(LocalDateTime lastHealthCheck) {
        this.lastHealthCheck = lastHealthCheck;
    }

    public String getProcessId() {
        return processId;
    }

    public void setProcessId(String processId) {
        this.processId = processId;
    }

    public String getContainerName() {
        return containerName;
    }

    public void setContainerName(String containerName) {
        this.containerName = containerName;
    }

    public String getDeploymentPath() {
        return deploymentPath;
    }

    public void setDeploymentPath(String deploymentPath) {
        this.deploymentPath = deploymentPath;
    }

    public LocalDateTime getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(LocalDateTime startedAt) {
        this.startedAt = startedAt;
    }

    public LocalDateTime getStoppedAt() {
        return stoppedAt;
    }

    public void setStoppedAt(LocalDateTime stoppedAt) {
        this.stoppedAt = stoppedAt;
    }

    public Boolean getActiveFlag() {
        return activeFlag;
    }

    public void setActiveFlag(Boolean activeFlag) {
        this.activeFlag = activeFlag;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    // Backward-compatible ID accessors
    public Long getServiceId() {
        return service != null ? service.getId() : null;
    }

    public void setServiceId(Long serviceId) {
        // No-op for backward compatibility
    }

    public Long getServerId() {
        return server != null ? server.getId() : null;
    }

    public void setServerId(Long serverId) {
        // No-op for backward compatibility
    }

    public Long getEnvironmentId() {
        return environment != null ? environment.getId() : null;
    }

    public void setEnvironmentId(Long environmentId) {
        // No-op for backward compatibility
    }

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o)
            return true;
        if (!(o instanceof Deployment))
            return false;
        Deployment that = (Deployment) o;
        return Objects.equals(id, that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    @JsonProperty("environmentName")
    public String getEnvironmentName() {
        return environment != null ? environment.getName() : null;
    }

    public DeploymentStatus getStatusEnum() {
        if (status == null)
            return DeploymentStatus.UNKNOWN;
        try {
            return DeploymentStatus.valueOf(status);
        } catch (IllegalArgumentException e) {
            return DeploymentStatus.UNKNOWN;
        }
    }

    public HealthStatus getHealthStatusEnum() {
        if (healthStatus == null)
            return HealthStatus.UNKNOWN;
        try {
            return HealthStatus.valueOf(healthStatus);
        } catch (IllegalArgumentException e) {
            return HealthStatus.UNKNOWN;
        }
    }

    public enum DeploymentStatus {
        RUNNING, STOPPED, STARTING, STOPPING, FAILED, UNKNOWN
    }

    public enum HealthStatus {
        HEALTHY, UNHEALTHY, DEGRADED, UNKNOWN
    }
}
