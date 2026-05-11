package com.aibizarchitect.nexus.v1.spring.serviceregistry.entity;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
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
@Table(name = "services")
@JsonIgnoreProperties({ "deployments", "serviceConfigs", "serviceDependenciesAsConsumer",
        "serviceDependenciesAsProvider", "subModules" })
public class Service {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(length = 1000)
    private String description;

    @ManyToOne(optional = false)
    @JoinColumn(name = "framework_id")
    private Framework framework;

    @ManyToOne(optional = false)
    @JoinColumn(name = "service_type_id")
    private ServiceType type;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "component_override_id", referencedColumnName = "id", nullable = true)
    private VisualComponent componentOverride;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_service_id")
    private Service parentService;

    @OneToMany(mappedBy = "parentService", fetch = FetchType.LAZY)
    private Set<Service> subModules = new HashSet<>();

    @Column(name = "default_port")
    private Integer defaultPort;

    @Column(name = "api_base_path")
    private String apiBasePath;

    @Column(name = "repository_url")
    private String repositoryUrl;

    @Column
    private String version;

    @Column
    private String status;

    @Column(name = "active_flag")
    private Boolean activeFlag = true;

    @Column
    private LocalDateTime createdAt;

    @Column
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "service", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<Deployment> deployments = new HashSet<>();

    @OneToMany(mappedBy = "service")
    private Set<ServiceConfiguration> serviceConfigs = new HashSet<>();

    @OneToMany(mappedBy = "service")
    private Set<ServiceDependency> serviceDependenciesAsConsumer = new HashSet<>();

    @OneToMany(mappedBy = "targetService")
    private Set<ServiceDependency> serviceDependenciesAsProvider = new HashSet<>();

    public Service() {
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

    public Framework getFramework() {
        return framework;
    }

    public void setFramework(Framework framework) {
        this.framework = framework;
    }

    public ServiceType getType() {
        return type;
    }

    public void setType(ServiceType type) {
        this.type = type;
    }

    public VisualComponent getComponentOverride() {
        return componentOverride;
    }

    public void setComponentOverride(VisualComponent componentOverride) {
        this.componentOverride = componentOverride;
    }

    public Service getParentService() {
        return parentService;
    }

    public void setParentService(Service parentService) {
        this.parentService = parentService;
    }

    public Set<Service> getSubModules() {
        return subModules;
    }

    public void setSubModules(Set<Service> subModules) {
        this.subModules = subModules;
    }

    public Integer getDefaultPort() {
        return defaultPort;
    }

    public void setDefaultPort(Integer defaultPort) {
        this.defaultPort = defaultPort;
    }

    public String getApiBasePath() {
        return apiBasePath;
    }

    public void setApiBasePath(String apiBasePath) {
        this.apiBasePath = apiBasePath;
    }

    public String getRepositoryUrl() {
        return repositoryUrl;
    }

    public void setRepositoryUrl(String repositoryUrl) {
        this.repositoryUrl = repositoryUrl;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
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

    public Set<Deployment> getDeployments() {
        return deployments;
    }

    public void setDeployments(Set<Deployment> deployments) {
        this.deployments = deployments;
    }

    public Set<ServiceConfiguration> getServiceConfigs() {
        return serviceConfigs;
    }

    public void setServiceConfigs(Set<ServiceConfiguration> serviceConfigs) {
        this.serviceConfigs = serviceConfigs;
    }

    public Set<ServiceDependency> getServiceDependenciesAsConsumer() {
        return serviceDependenciesAsConsumer;
    }

    public void setServiceDependenciesAsConsumer(Set<ServiceDependency> serviceDependenciesAsConsumer) {
        this.serviceDependenciesAsConsumer = serviceDependenciesAsConsumer;
    }

    public Set<ServiceDependency> getServiceDependenciesAsProvider() {
        return serviceDependenciesAsProvider;
    }

    public void setServiceDependenciesAsProvider(Set<ServiceDependency> serviceDependenciesAsProvider) {
        this.serviceDependenciesAsProvider = serviceDependenciesAsProvider;
    }

    // Backward-compatible ID accessors
    public Long getFrameworkId() {
        return framework != null ? framework.getId() : null;
    }

    public void setFrameworkId(Long frameworkId) {
        if (frameworkId != null) {
            this.framework = new Framework();
            this.framework.setId(frameworkId);
        }
    }

    public Long getServiceTypeId() {
        return type != null ? type.getId() : null;
    }

    public void setServiceTypeId(Long serviceTypeId) {
        if (serviceTypeId != null) {
            this.type = new ServiceType();
            this.type.setId(serviceTypeId);
        }
    }
    
    public Long getParentServiceId() {
        return parentService != null ? parentService.getId() : null;
    }

    public void setParentServiceId(Long parentServiceId) {
        if (parentServiceId != null) {
            this.parentService = new Service();
            this.parentService.setId(parentServiceId);
        } else {
            this.parentService = null;
        }
    }

    public String getHealthCheckPath() {
        return apiBasePath != null ? apiBasePath + "/actuator/health" : null;
    }

    public void setHealthCheckPath(String healthCheckPath) {
        // No-op for backward compatibility
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
        if (!(o instanceof Service))
            return false;
        Service service = (Service) o;
        return Objects.equals(id, service.id) &&
                Objects.equals(name, service.name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, name);
    }
}
