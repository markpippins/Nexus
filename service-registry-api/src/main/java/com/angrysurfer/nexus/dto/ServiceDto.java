package com.angrysurfer.nexus.dto;

import java.time.LocalDateTime;

public class ServiceDto {
    private Long id;
    private String name;
    private String description;
    private FrameworkDto framework;
    private String type;
    private String repositoryUrl;
    private String version;
    private Integer defaultPort;
    private String healthCheckPath;
    private String apiBasePath;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public ServiceDto() {
    }

    public ServiceDto(Long id, String name, String description, FrameworkDto framework, String type,
            String repositoryUrl, String version, Integer defaultPort, String healthCheckPath, String apiBasePath,
            String status, LocalDateTime createdAt, LocalDateTime updatedAt) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.framework = framework;
        this.type = type;
        this.repositoryUrl = repositoryUrl;
        this.version = version;
        this.defaultPort = defaultPort;
        this.healthCheckPath = healthCheckPath;
        this.apiBasePath = apiBasePath;
        this.status = status;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public FrameworkDto getFramework() {
        return framework;
    }

    public void setFramework(FrameworkDto framework) {
        this.framework = framework;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getRepositoryUrl() {
        return repositoryUrl;
    }

    public void setRepositoryUrl(String repositoryUrl) {
        this.repositoryUrl = repositoryUrl;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public Integer getDefaultPort() {
        return defaultPort;
    }

    public void setDefaultPort(Integer defaultPort) {
        this.defaultPort = defaultPort;
    }

    public String getHealthCheckPath() {
        return healthCheckPath;
    }

    public void setHealthCheckPath(String healthCheckPath) {
        this.healthCheckPath = healthCheckPath;
    }

    public String getApiBasePath() {
        return apiBasePath;
    }

    public void setApiBasePath(String apiBasePath) {
        this.apiBasePath = apiBasePath;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
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
}
