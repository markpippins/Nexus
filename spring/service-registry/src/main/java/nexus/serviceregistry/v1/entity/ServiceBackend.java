package nexus.serviceregistry.v1.entity;

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

/**
 * Represents a backend connection between service instances.
 * 
 * Example: A file-service instance (deployment) connects to one or more
 * file-system-server instances (backend deployments) for storage.
 * 
 * Supports multiple backends per service for:
 * - Primary/backup configurations
 * - Load balancing
 * - Data sharding
 * - Caching layers
 */
@Entity
@Table(name = "service_backends")
public class ServiceBackend {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * The service instance that uses this backend
     * Example: file-service deployment on port 8084
     */
    @Column(name = "service_deployment_id", nullable = false)
    private Long serviceDeploymentId;

    @ManyToOne
    @JoinColumn(name = "service_deployment_id", referencedColumnName = "id", insertable = false, updatable = false)
    private Deployment serviceDeployment;

    /**
     * The backend service instance being used
     * Example: file-system-server deployment on port 4040
     */
    @Column(name = "backend_deployment_id", nullable = false)
    private Long backendDeploymentId;

    @ManyToOne
    @JoinColumn(name = "backend_deployment_id", referencedColumnName = "id", insertable = false, updatable = false)
    private Deployment backendDeployment;

    /**
     * Role of this backend in the service architecture
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BackendRole role = BackendRole.PRIMARY;

    /**
     * Priority for failover (1 = highest priority)
     * Used when multiple backends have the same role
     */
    @Column
    private Integer priority = 1;

    /**
     * Routing key for sharding/partitioning
     * Example: "users-a-m", "region-us-east", "tenant-123"
     */
    @Column(length = 100)
    private String routingKey;

    /**
     * Weight for load balancing (higher = more traffic)
     */
    @Column
    private Integer weight = 100;

    /**
     * Whether this backend is currently active
     */
    @Column(nullable = false)
    private Boolean isActive = true;

    /**
     * Description of this backend connection
     */
    @Column(length = 500)
    private String description;

    @Column
    private LocalDateTime createdAt;

    @Column
    private LocalDateTime updatedAt;

    public ServiceBackend() {
    }

    public ServiceBackend(Long id, Long serviceDeploymentId, Deployment serviceDeployment, Long backendDeploymentId,
            Deployment backendDeployment, BackendRole role, Integer priority, String routingKey, Integer weight,
            Boolean isActive, String description, LocalDateTime createdAt, LocalDateTime updatedAt) {
        this.id = id;
        this.serviceDeploymentId = serviceDeploymentId;
        this.serviceDeployment = serviceDeployment;
        this.backendDeploymentId = backendDeploymentId;
        this.backendDeployment = backendDeployment;
        this.role = role;
        this.priority = priority;
        this.routingKey = routingKey;
        this.weight = weight;
        this.isActive = isActive;
        this.description = description;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getServiceDeploymentId() {
        return serviceDeploymentId;
    }

    public void setServiceDeploymentId(Long serviceDeploymentId) {
        this.serviceDeploymentId = serviceDeploymentId;
    }

    public Deployment getServiceDeployment() {
        return serviceDeployment;
    }

    public void setServiceDeployment(Deployment serviceDeployment) {
        this.serviceDeployment = serviceDeployment;
    }

    public Long getBackendDeploymentId() {
        return backendDeploymentId;
    }

    public void setBackendDeploymentId(Long backendDeploymentId) {
        this.backendDeploymentId = backendDeploymentId;
    }

    public Deployment getBackendDeployment() {
        return backendDeployment;
    }

    public void setBackendDeployment(Deployment backendDeployment) {
        this.backendDeployment = backendDeployment;
    }

    public BackendRole getRole() {
        return role;
    }

    public void setRole(BackendRole role) {
        this.role = role;
    }

    public Integer getPriority() {
        return priority;
    }

    public void setPriority(Integer priority) {
        this.priority = priority;
    }

    public String getRoutingKey() {
        return routingKey;
    }

    public void setRoutingKey(String routingKey) {
        this.routingKey = routingKey;
    }

    public Integer getWeight() {
        return weight;
    }

    public void setWeight(Integer weight) {
        this.weight = weight;
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
        if (!(o instanceof ServiceBackend))
            return false;
        ServiceBackend that = (ServiceBackend) o;
        return Objects.equals(id, that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    /**
     * Role of a backend in the service architecture
     */
    public enum BackendRole {
        /**
         * Primary backend - main data source
         */
        PRIMARY,

        /**
         * Backup backend - used when primary fails
         */
        BACKUP,

        /**
         * Archive backend - cold storage for old data
         */
        ARCHIVE,

        /**
         * Cache backend - hot cache layer
         */
        CACHE,

        /**
         * Shard backend - handles a partition of data
         */
        SHARD,

        /**
         * Read replica - handles read-only queries
         */
        READ_REPLICA
    }
}
