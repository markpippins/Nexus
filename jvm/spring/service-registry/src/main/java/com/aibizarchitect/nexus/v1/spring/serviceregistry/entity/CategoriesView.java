package com.aibizarchitect.nexus.v1.spring.serviceregistry.entity;

import java.time.LocalDateTime;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import org.hibernate.annotations.Immutable;

/**
 * Read-only entity mapping to the {@code registry.categories} view.
 *
 * This view is a UNION ALL of all 8 type lookup tables (framework_type,
 * server_type, library_type, environment_type, service_type,
 * service_config_type, operating_systems, system_type) with a {@code type}
 * discriminator column.  Because it is a view (not a table), the entity is
 * marked {@link Immutable} — Hibernate will never attempt INSERT/UPDATE/DELETE.
 *
 * {@link CategoriesViewId} forms the composite primary key because the same
 * numeric {@code id} can appear across different type discriminator groups.
 */
@Entity
@Immutable
@IdClass(CategoriesViewId.class)
@Table(name = "categories", schema = "registry")
public class CategoriesView {

    @Id
    @Column(name = "id")
    private Long id;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "description", length = 1000)
    private String description;

    @Column(name = "active_flag")
    private Boolean activeFlag;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    /** Discriminator — one of: framework_type, server_type, library_type, system_type, etc. Part of composite PK. */
    @Id
    @Column(name = "type", nullable = false, insertable = false, updatable = false)
    private String type;

    @Column(name = "default_component_id")
    private Long defaultComponentId;

    @Column(name = "architecture")
    private String architecture;

    @Column(name = "family")
    private String family;

    @Column(name = "lts_flag")
    private Boolean ltsFlag;

    @Column(name = "version")
    private String version;

    // -- Constructors

    public CategoriesView() {
    }

    // -- Getters / Setters

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

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public Long getDefaultComponentId() {
        return defaultComponentId;
    }

    public void setDefaultComponentId(Long defaultComponentId) {
        this.defaultComponentId = defaultComponentId;
    }

    public String getArchitecture() {
        return architecture;
    }

    public void setArchitecture(String architecture) {
        this.architecture = architecture;
    }

    public String getFamily() {
        return family;
    }

    public void setFamily(String family) {
        this.family = family;
    }

    public Boolean getLtsFlag() {
        return ltsFlag;
    }

    public void setLtsFlag(Boolean ltsFlag) {
        this.ltsFlag = ltsFlag;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    // -- Object overrides

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof CategoriesView)) return false;
        CategoriesView that = (CategoriesView) o;
        return Objects.equals(id, that.id) && Objects.equals(type, that.type);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, type);
    }

    @Override
    public String toString() {
        return "CategoriesView{id=" + id + ", name='" + name + "', type='" + type + "'}";
    }
}
