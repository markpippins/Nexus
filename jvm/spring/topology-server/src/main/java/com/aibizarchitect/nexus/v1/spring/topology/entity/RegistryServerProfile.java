package com.aibizarchitect.nexus.v1.spring.topology.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "registry_server_profiles")
public class RegistryServerProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "profile_id", nullable = false, unique = true)
    private String profileId;

    @Column(nullable = false)
    private String name;

    @Column(name = "registry_server_url")
    private String registryServerUrl;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "is_active")
    private Boolean isActive = false;

    @Column(columnDefinition = "TEXT")
    private String description;

    public RegistryServerProfile() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getProfileId() {
        return profileId;
    }

    public void setProfileId(String profileId) {
        this.profileId = profileId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getRegistryServerUrl() {
        return registryServerUrl;
    }

    public void setRegistryServerUrl(String registryServerUrl) {
        this.registryServerUrl = registryServerUrl;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
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
}
