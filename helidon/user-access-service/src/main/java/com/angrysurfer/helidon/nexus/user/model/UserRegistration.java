package com.angrysurfer.helidon.nexus.user.model;

import java.io.Serializable;

import com.angrysurfer.helidon.nexus.user.UserRegistrationDTO;

import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;


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

    @Column(nullable = false)
    private boolean admin = false;

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
        UserRegistrationDTO dto = new UserRegistrationDTO();
        dto.setId(getId() != null ? String.valueOf(getId()) : null);
        dto.setAlias(getAlias());
        dto.setEmail(getEmail());
        dto.setAdmin(isAdmin());
        return dto;
    }

    public UserRegistration() {
    }

    public UserRegistration(String alias, String email) {
        setAlias(alias);
        setEmail(email);
    }

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
