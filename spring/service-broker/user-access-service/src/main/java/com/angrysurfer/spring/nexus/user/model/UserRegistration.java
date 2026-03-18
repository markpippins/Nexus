package com.angrysurfer.spring.nexus.user.model;

import java.io.Serializable;

import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

import com.angrysurfer.spring.nexus.user.UserRegistrationDTO;

/**
 * User registration entity stored in MySQL.
 * Single identifier pattern (auto-increment Long ID).
 */
@Entity
@Table(name = "users")
public class UserRegistration implements Serializable {

    private static final long serialVersionUID = 2747813660378401172L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    @NotBlank(message = "Alias is required")
    private String alias;

    @Column(nullable = false, unique = true, length = 255)
    @Email(message = "Email should be valid")
    private String email;

    @Column(nullable = false, length = 255)
    private String identifier;

    @Column(nullable = false)
    private boolean admin = false;

    @Column(name = "avatar_url", length = 500)
    private String avatarUrl = "https://picsum.photos/50/50";

    @Column(name = "created_at")
    @Temporal(TemporalType.TIMESTAMP)
    private java.util.Date createdAt;

    @Column(name = "updated_at")
    @Temporal(TemporalType.TIMESTAMP)
    private java.util.Date updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = new java.util.Date();
        updatedAt = new java.util.Date();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = new java.util.Date();
    }

    public UserRegistrationDTO toDTO() {
        com.angrysurfer.spring.nexus.user.UserRegistrationDTO dto = 
            new com.angrysurfer.spring.nexus.user.UserRegistrationDTO();
        dto.setId(getId() != null ? String.valueOf(getId()) : null);
        dto.setAlias(getAlias());
        dto.setEmail(getEmail());
        dto.setIdentifier(getIdentifier());
        dto.setAdmin(isAdmin());
        dto.setAvatarUrl(getAvatarUrl());
        return dto;
    }

    public UserRegistration() {
    }

    public UserRegistration(String alias, String email, String avatarUrl) {
        setAlias(alias);
        setEmail(email);
        setAvatarUrl(avatarUrl);
    }

    public UserRegistration(String alias, String email, String avatarUrl, String identifier) {
        setAlias(alias);
        setEmail(email);
        setAvatarUrl(avatarUrl);
        setIdentifier(identifier);
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getAlias() {
        return alias;
    }

    public void setAlias(String alias) {
        this.alias = alias;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public String getIdentifier() {
        return identifier;
    }

    public void setIdentifier(String identifier) {
        this.identifier = identifier;
    }

    public boolean isAdmin() {
        return admin;
    }

    public void setAdmin(boolean admin) {
        this.admin = admin;
    }

    public java.util.Date getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(java.util.Date createdAt) {
        this.createdAt = createdAt;
    }

    public java.util.Date getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(java.util.Date updatedAt) {
        this.updatedAt = updatedAt;
    }
}
