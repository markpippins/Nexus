package nexus.serviceregistry.v1.entity;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

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
@Table(name = "library")
public class Library {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(length = 1000)
    private String description;

    @ManyToOne
    @JoinColumn(name = "category_id")
    private LibraryCategory category;

    @ManyToOne
    @JoinColumn(name = "language_id")
    private FrameworkLanguage language;

    @Column(name = "current_version")
    private String currentVersion;

    @Column(name = "package_name")
    private String packageName; // e.g., "three", "@angular/core", "org.springframework:spring-boot"

    @Column(name = "package_manager")
    private String packageManager; // npm, maven, pip, cargo, etc.

    @Column
    private String url; // Homepage or documentation URL

    @Column(name = "repository_url")
    private String repositoryUrl; // GitHub/GitLab URL

    @Column(name = "license")
    private String license; // MIT, Apache 2.0, etc.

    @Column(name = "active_flag")
    private Boolean activeFlag = true;

    @Column
    private LocalDateTime createdAt;

    @Column
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "library")
    private Set<ServiceLibrary> serviceLibraries = new HashSet<>();

    public Library() {
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

    public LibraryCategory getCategory() {
        return category;
    }

    public void setCategory(LibraryCategory category) {
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

    public String getPackageName() {
        return packageName;
    }

    public void setPackageName(String packageName) {
        this.packageName = packageName;
    }

    public String getPackageManager() {
        return packageManager;
    }

    public void setPackageManager(String packageManager) {
        this.packageManager = packageManager;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getRepositoryUrl() {
        return repositoryUrl;
    }

    public void setRepositoryUrl(String repositoryUrl) {
        this.repositoryUrl = repositoryUrl;
    }

    public String getLicense() {
        return license;
    }

    public void setLicense(String license) {
        this.license = license;
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

    public Set<ServiceLibrary> getServiceLibraries() {
        return serviceLibraries;
    }

    public void setServiceLibraries(Set<ServiceLibrary> serviceLibraries) {
        this.serviceLibraries = serviceLibraries;
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
        if (!(o instanceof Library))
            return false;
        Library library = (Library) o;
        return Objects.equals(id, library.id) &&
                Objects.equals(name, library.name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, name);
    }
}
