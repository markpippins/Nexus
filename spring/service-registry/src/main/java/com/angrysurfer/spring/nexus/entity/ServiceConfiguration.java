package com.angrysurfer.spring.nexus.entity;

import java.time.LocalDateTime;
import java.util.Objects;

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
@Table(name = "service_configs")
public class ServiceConfiguration {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "service_id", nullable = false)
    private Long serviceId;

    @ManyToOne
    @JoinColumn(name = "service_id", referencedColumnName = "id", insertable = false, updatable = false)
    private Service service;

    @Column(name = "config_type_id", nullable = false)
    private Long configTypeId;

    @Column(length = 1000)
    private String description;

    @Column(name = "config_key", nullable = false)
    private String configKey;

    @Column(name = "config_value", nullable = false)
    private String configValue;

    @Column(name = "environment_id", nullable = false)
    private Long environmentId;

    @Column(name = "active_flag")
    private Boolean activeFlag = true;

    @Column
    private LocalDateTime createdAt;

    @Column
    private LocalDateTime updatedAt;

    public ServiceConfiguration() {
    }

    public ServiceConfiguration(Long id, Long serviceId, Service service, Long configTypeId, String description,
            String configKey, String configValue, Long environmentId, Boolean activeFlag, LocalDateTime createdAt,
            LocalDateTime updatedAt) {
        this.id = id;
        this.serviceId = serviceId;
        this.service = service;
        this.configTypeId = configTypeId;
        this.description = description;
        this.configKey = configKey;
        this.configValue = configValue;
        this.environmentId = environmentId;
        this.activeFlag = activeFlag;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getServiceId() {
        return serviceId;
    }

    public void setServiceId(Long serviceId) {
        this.serviceId = serviceId;
    }

    public Service getService() {
        return service;
    }

    public void setService(Service service) {
        this.service = service;
    }

    public Long getConfigTypeId() {
        return configTypeId;
    }

    public void setConfigTypeId(Long configTypeId) {
        this.configTypeId = configTypeId;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getConfigKey() {
        return configKey;
    }

    public void setConfigKey(String configKey) {
        this.configKey = configKey;
    }

    public String getConfigValue() {
        return configValue;
    }

    public void setConfigValue(String configValue) {
        this.configValue = configValue;
    }

    public Long getEnvironmentId() {
        return environmentId;
    }

    public void setEnvironmentId(Long environmentId) {
        this.environmentId = environmentId;
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
        if (!(o instanceof ServiceConfiguration))
            return false;
        ServiceConfiguration that = (ServiceConfiguration) o;
        return Objects.equals(id, that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    public enum ConfigEnvironment {
        ALL, DEVELOPMENT, STAGING, PRODUCTION, TEST
    }

    public enum ConfigType {
        STRING, NUMBER, BOOLEAN, JSON, URL, DATABASE_URL, API_KEY
    }

    // Methods needed for backward compatibility with controllers and services
    public ConfigEnvironment getEnvironment() {
        // This field was removed, returning null for now
        return null;
    }

    public void setEnvironment(ConfigEnvironment environment) {
        // This field was removed, doing nothing for now
    }

    public ConfigType getType() {
        // This field was removed, returning null for now
        return null;
    }

    public void setType(ConfigType type) {
        // This field was removed, doing nothing for now
    }

    public Boolean getIsSecret() {
        // This field was removed, returning false for now
        return false;
    }

    public void setIsSecret(Boolean isSecret) {
        // This field was removed, doing nothing for now
    }
}
