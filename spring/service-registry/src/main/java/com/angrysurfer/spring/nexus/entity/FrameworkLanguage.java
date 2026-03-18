package com.angrysurfer.spring.nexus.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "languages")
public class FrameworkLanguage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(length = 1000)
    private String description;

    @Column
    private String url;

    @Column(name = "current_version")
    private String currentVersion;

    @Column(name = "lts_version")
    private String ltsVersion;

    @Column(name = "active_flag")
    private Boolean activeFlag = true;

    public FrameworkLanguage() {
    }

    public FrameworkLanguage(Long id, String name, String description, String url, String currentVersion,
            String ltsVersion, Boolean activeFlag) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.url = url;
        this.currentVersion = currentVersion;
        this.ltsVersion = ltsVersion;
        this.activeFlag = activeFlag;
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

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
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

    public Boolean getActiveFlag() {
        return activeFlag;
    }

    public void setActiveFlag(Boolean activeFlag) {
        this.activeFlag = activeFlag;
    }
}
