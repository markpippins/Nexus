package com.angrysurfer.spring.nexus.dto;

import com.angrysurfer.spring.nexus.entity.Host;
import java.time.LocalDateTime;

public class ServerDto {
    private Long id;
    private String hostname;
    private String ipAddress;
    private String type;
    private String environment;
    private String operatingSystem;
    private Integer cpuCores;
    private String memory;
    private String disk;
    private String region;
    private String cloudProvider;
    private String status;
    private String description;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public ServerDto() {
    }

    public ServerDto(Long id, String hostname, String ipAddress, String type, String environment,
            String operatingSystem, Integer cpuCores, String memory, String disk, String region, String cloudProvider,
            String status, String description, LocalDateTime createdAt, LocalDateTime updatedAt) {
        this.id = id;
        this.hostname = hostname;
        this.ipAddress = ipAddress;
        this.type = type;
        this.environment = environment;
        this.operatingSystem = operatingSystem;
        this.cpuCores = cpuCores;
        this.memory = memory;
        this.disk = disk;
        this.region = region;
        this.cloudProvider = cloudProvider;
        this.status = status;
        this.description = description;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getHostname() {
        return hostname;
    }

    public void setHostname(String hostname) {
        this.hostname = hostname;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public void setIpAddress(String ipAddress) {
        this.ipAddress = ipAddress;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getEnvironment() {
        return environment;
    }

    public void setEnvironment(String environment) {
        this.environment = environment;
    }

    public String getOperatingSystem() {
        return operatingSystem;
    }

    public void setOperatingSystem(String operatingSystem) {
        this.operatingSystem = operatingSystem;
    }

    public Integer getCpuCores() {
        return cpuCores;
    }

    public void setCpuCores(Integer cpuCores) {
        this.cpuCores = cpuCores;
    }

    public String getMemory() {
        return memory;
    }

    public void setMemory(String memory) {
        this.memory = memory;
    }

    public String getDisk() {
        return disk;
    }

    public void setDisk(String disk) {
        this.disk = disk;
    }

    public String getRegion() {
        return region;
    }

    public void setRegion(String region) {
        this.region = region;
    }

    public String getCloudProvider() {
        return cloudProvider;
    }

    public void setCloudProvider(String cloudProvider) {
        this.cloudProvider = cloudProvider;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
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

    public static ServerDto fromEntity(Host host) {
        ServerDto dto = new ServerDto();
        dto.setId(host.getId());
        dto.setHostname(host.getHostname());
        dto.setIpAddress(host.getIpAddress());
        dto.setType(host.getServerTypeId() != null ? host.getServerTypeId().toString() : null);
        dto.setEnvironment(host.getEnvironmentTypeId() != null ? host.getEnvironmentTypeId().toString() : null);
        dto.setOperatingSystem(host.getOperatingSystemId() != null ? host.getOperatingSystemId().toString() : null);
        dto.setCpuCores(host.getCpuCores());
        dto.setMemory(host.getMemory());
        dto.setDisk(host.getDisk());
        dto.setRegion(host.getRegion());
        dto.setCloudProvider(host.getCloudProvider());
        dto.setStatus(host.getStatus());
        dto.setDescription(host.getDescription());
        dto.setCreatedAt(host.getCreatedAt());
        dto.setUpdatedAt(host.getUpdatedAt());
        return dto;
    }
}
