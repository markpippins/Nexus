package com.aibizarchitect.nexus.v1.dto;

import java.time.LocalDateTime;

public class FrameworkDto {
    private Long id;
    private String name;
    private String description;
    private String category;
    private String language;
    private String latestVersion;
    private String documentationUrl;
    private String repositoryUrl;
    private Boolean supportsBrokerPattern;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public FrameworkDto() {
    }

    public FrameworkDto(Long id, String name, String description, String category, String language,
            String latestVersion, String documentationUrl, String repositoryUrl, Boolean supportsBrokerPattern,
            LocalDateTime createdAt, LocalDateTime updatedAt) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.category = category;
        this.language = language;
        this.latestVersion = latestVersion;
        this.documentationUrl = documentationUrl;
        this.repositoryUrl = repositoryUrl;
        this.supportsBrokerPattern = supportsBrokerPattern;
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

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = language;
    }

    public String getLatestVersion() {
        return latestVersion;
    }

    public void setLatestVersion(String latestVersion) {
        this.latestVersion = latestVersion;
    }

    public String getDocumentationUrl() {
        return documentationUrl;
    }

    public void setDocumentationUrl(String documentationUrl) {
        this.documentationUrl = documentationUrl;
    }

    public String getRepositoryUrl() {
        return repositoryUrl;
    }

    public void setRepositoryUrl(String repositoryUrl) {
        this.repositoryUrl = repositoryUrl;
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
}
