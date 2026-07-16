package com.aibizarchitect.nexus.v1.spring.serviceregistry.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Junction table linking systems to services.
 * Tracks which services belong to which systems and their role within the system.
 */
@Entity
@Table(name = "system_services", schema = "registry", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"system_id", "service_id"})
})
public class SystemServices {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "system_id", nullable = false)
    private Systems system;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "service_id", nullable = false)
    private Service service;

    @Column(name = "role_in_system", length = 100)
    private String roleInSystem;

    @Column(name = "active_flag")
    private Boolean activeFlag = true;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Systems getSystem() { return system; }
    public void setSystem(Systems system) { this.system = system; }
    public Service getService() { return service; }
    public void setService(Service service) { this.service = service; }
    public String getRoleInSystem() { return roleInSystem; }
    public void setRoleInSystem(String roleInSystem) { this.roleInSystem = roleInSystem; }
    public Boolean getActiveFlag() { return activeFlag; }
    public void setActiveFlag(Boolean activeFlag) { this.activeFlag = activeFlag; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
