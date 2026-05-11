package com.aibizarchitect.nexus.v1.spring.serviceregistry.entity;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "frameworks")
@JsonIgnoreProperties({ "services" })
public class Framework {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(length = 1000)
    private String description;

    @ManyToOne
    @JoinColumn(name = "vendor_id")
    private FrameworkVendor vendor;

    @ManyToOne(optional = false)
    @JoinColumn(name = "category_id")
    private FrameworkCategory category;

    @ManyToOne(optional = false)
    @JoinColumn(name = "language_id")
    private FrameworkLanguage language;

    @Column(name = "current_version")
    private String currentVersion;

    @Column(name = "lts_version")
    private String ltsVersion;

    @Column
    private String url;

    @Column(name = "active_flag")
    private Boolean activeFlag = true;

    @Column(name = "supports_broker_pattern")
    private Boolean supportsBrokerPattern = false;

    @Column
    private LocalDateTime createdAt;

    @Column
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "framework")
    private Set<Service> services = new HashSet<>();

    public Framework() {
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

    public FrameworkVendor getVendor() {
        return vendor;
    }

    public void setVendor(FrameworkVendor vendor) {
        this.vendor = vendor;
    }

    public FrameworkCategory getCategory() {
        return category;
    }

    public void setCategory(FrameworkCategory category) {
        this.category = category;
    }

    public FrameworkLanguage getLanguage() {
        return language;
    }

    public void setLanguage(FrameworkLanguage language) {
        this.language = language;
    }

    public String getCurrentVersion() {
        return currentVersion;
    }

    public void setCurrentVersion(String currentVersion) {
        this.currentVersion = currentVersion;
    }

    public String getLtsVersion() {
        return ltsVersion;
    }

    public void setLtsVersion(String ltsVersion) {
        this.ltsVersion = ltsVersion;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public Boolean getActiveFlag() {
        return activeFlag;
    }

    public void setActiveFlag(Boolean activeFlag) {
        this.activeFlag = activeFlag;
    }

    public Boolean getSupportsBrokerPattern() {
        return supportsBrokerPattern;
    }

    public void setSupportsBrokerPattern(Boolean supportsBrokerPattern) {
        this.supportsBrokerPattern = supportsBrokerPattern;
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

    public Set<Service> getServices() {
        return services;
    }

    public void setServices(Set<Service> services) {
        this.services = services;
    }

    // Backward-compatible ID accessors
    public Long getVendorId() {
        return vendor != null ? vendor.getId() : null;
    }

    public void setVendorId(Long vendorId) {
        // No-op for backward compatibility
    }

    public Long getCategoryId() {
        return category != null ? category.getId() : null;
    }

    public void setCategoryId(Long categoryId) {
        // No-op for backward compatibility
    }

    public Long getLanguageId() {
        return language != null ? language.getId() : null;
    }

    public void setLanguageId(Long languageId) {
        // No-op for backward compatibility
    }

    public String getLatestVersion() {
        return currentVersion;
    }

    public String getDocumentationUrl() {
        return url;
    }

    public String getRepositoryUrl() {
        return url;
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
        if (!(o instanceof Framework))
            return false;
        Framework framework = (Framework) o;
        return Objects.equals(id, framework.id) &&
                Objects.equals(name, framework.name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, name);
    }
}
