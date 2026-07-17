package com.aibizarchitect.nexus.v1.spring.user.model;

import java.io.Serializable;
import java.util.UUID;

import com.aibizarchitect.nexus.v1.user.UserRegistrationDTO;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Temporal;
import jakarta.persistence.TemporalType;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * User registration entity stored in the assembly schema (PostgreSQL).
 * Uses UUID primary keys generated at the database level via gen_random_uuid().
 */
@Entity
@Table(name = "users", schema = "assembly")
public class UserRegistration implements Serializable {

    private static final long serialVersionUID = 2747813660378401172L;

    @Id
    @Column(columnDefinition = "UUID DEFAULT gen_random_uuid()")
    private UUID id;

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

    @Column(nullable = false, length = 255)
    private String password;

    @Column(name = "created_at")
    @Temporal(TemporalType.TIMESTAMP)
    private java.util.Date createdAt;

    @Column(name = "updated_at")
    @Temporal(TemporalType.TIMESTAMP)
    private java.util.Date updatedAt;

    @PrePersist
    protected void onCreate() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        createdAt = new java.util.Date();
        updatedAt = new java.util.Date();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = new java.util.Date();
    }

    public UserRegistrationDTO toDTO() {
        UserRegistrationDTO dto = new UserRegistrationDTO();
        dto.setId(getId() != null ? getId().toString() : null);
        dto.setAlias(getAlias());
        dto.setEmail(getEmail());
        dto.setAdmin(isAdmin());
        return dto;
    }

    public UserRegistration() {
        this.identifier = "";
    }

    public UserRegistration(String alias, String email) {
        setAlias(alias);
        setEmail(email);
        this.identifier = "";
    }

    public UserRegistration(String alias, String email, String identifier) {
        setAlias(alias);
        setEmail(email);
        setIdentifier(identifier);
    }

    // Getters and Setters
    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
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

    public boolean isAdmin() {
        return admin;
    }

    public void setAdmin(boolean admin) {
        this.admin = admin;
    }

    public String getIdentifier() {
        return identifier;
    }

    public void setIdentifier(String identifier) {
        this.identifier = identifier;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public java.util.Date getCreatedAt()
 {
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
