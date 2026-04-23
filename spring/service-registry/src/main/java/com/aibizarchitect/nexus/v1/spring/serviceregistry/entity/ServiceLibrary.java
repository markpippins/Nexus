package com.aibizarchitect.nexus.v1.spring.serviceregistry.entity;

import java.time.LocalDateTime;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * Join entity linking Services to Libraries with version information.
 * Represents compile-time dependencies for a service.
 * Version is tracked independently of the library's current version.
 */
@Entity
@Table(name = "service_libraries", uniqueConstraints = {
        @UniqueConstraint(columnNames = { "service_id", "library_id" })
})
public class ServiceLibrary {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "service_id", nullable = false)
    private Long serviceId;

    @ManyToOne
    @JoinColumn(name = "service_id", referencedColumnName = "id", insertable = false, updatable = false)
    private Service service;

    @Column(name = "library_id", nullable = false)
    private Long libraryId;

    @ManyToOne
    @JoinColumn(name = "library_id", referencedColumnName = "id", insertable = false, updatable = false)
    private Library library;

    /**
     * The specific version of the library used by this service.
     * This is independent of the library's currentVersion field.
     */
    @Column(name = "version", nullable = false)
    private String version;

    /**
     * Optional: Version constraint/range (e.g., "^1.0.0", ">=2.0.0 <3.0.0")
     */
    @Column(name = "version_constraint")
    private String versionConstraint;

    /**
     * Dependency scope: COMPILE, RUNTIME, TEST, PROVIDED, OPTIONAL
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "scope")
    private DependencyScope scope = DependencyScope.COMPILE;

    /**
     * Whether this is a direct dependency or transitive
     */
    @Column(name = "is_direct")
    private Boolean isDirect = true;

    /**
     * Whether this is a dev/development dependency
     */
    @Column(name = "is_dev_dependency")
    private Boolean isDevDependency = false;

    @Column(length = 500)
    private String notes;

    @Column(name = "active_flag")
    private Boolean activeFlag = true;

    @Column
    private LocalDateTime createdAt;

    @Column
    private LocalDateTime updatedAt;

    public ServiceLibrary() {
    }

    public ServiceLibrary(Long id, Long serviceId, Service service, Long libraryId, Library library, String version,
            String versionConstraint, DependencyScope scope, Boolean isDirect, Boolean isDevDependency, String notes,
            Boolean activeFlag, LocalDateTime createdAt, LocalDateTime updatedAt) {
        this.id = id;
        this.serviceId = serviceId;
        this.service = service;
        this.libraryId = libraryId;
        this.library = library;
        this.version = version;
        this.versionConstraint = versionConstraint;
        this.scope = scope;
        this.isDirect = isDirect;
        this.isDevDependency = isDevDependency;
        this.notes = notes;
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

    public Long getLibraryId() {
        return libraryId;
    }

    public void setLibraryId(Long libraryId) {
        this.libraryId = libraryId;
    }

    public Library getLibrary() {
        return library;
    }

    public void setLibrary(Library library) {
        this.library = library;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public String getVersionConstraint() {
        return versionConstraint;
    }

    public void setVersionConstraint(String versionConstraint) {
        this.versionConstraint = versionConstraint;
    }

    public DependencyScope getScope() {
        return scope;
    }

    public void setScope(DependencyScope scope) {
        this.scope = scope;
    }

    public Boolean getIsDirect() {
        return isDirect;
    }

    public void setIsDirect(Boolean isDirect) {
        this.isDirect = isDirect;
    }

    public Boolean getIsDevDependency() {
        return isDevDependency;
    }

    public void setIsDevDependency(Boolean isDevDependency) {
        this.isDevDependency = isDevDependency;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
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
        if (!(o instanceof ServiceLibrary))
            return false;
        ServiceLibrary that = (ServiceLibrary) o;
        return Objects.equals(id, that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    /**
     * Dependency scope enum
     */
    public enum DependencyScope {
        COMPILE, // Required at compile time (default)
        RUNTIME, // Only needed at runtime
        TEST, // Only needed for testing
        PROVIDED, // Provided by the container/runtime
        OPTIONAL // Optional dependency
    }
}
