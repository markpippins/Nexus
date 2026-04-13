package nexus.serviceregistry.v1.entity;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "operating_systems")
@JsonIgnoreProperties({ "servers" })
public class OperatingSystem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(name = "active_flag")
    private Boolean activeFlag = true;

    @Column
    private String version;

    @Column
    private String architecture;

    @Column(name = "lts_flag")
    private Boolean ltsFlag = false;

    @Column
    private String description;

    @Column
    private String family;

    @Column
    private LocalDateTime createdAt;

    @Column
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "operatingSystem", cascade = CascadeType.ALL)
    private Set<Host> servers = new HashSet<>();

    public OperatingSystem() {
    }

    public OperatingSystem(Long id, String name, Boolean activeFlag, String version, String architecture, Boolean ltsFlag,
            String description, String family, LocalDateTime createdAt, LocalDateTime updatedAt, Set<Host> servers) {
        this.id = id;
        this.name = name;
        this.activeFlag = activeFlag;
        this.version = version;
        this.architecture = architecture;
        this.ltsFlag = ltsFlag;
        this.description = description;
        this.family = family;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.servers = servers;
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

    public Boolean getActiveFlag() {
        return activeFlag;
    }

    public void setActiveFlag(Boolean activeFlag) {
        this.activeFlag = activeFlag;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public String getArchitecture() {
        return architecture;
    }

    public void setArchitecture(String architecture) {
        this.architecture = architecture;
    }

    public Boolean getLtsFlag() {
        return ltsFlag;
    }

    public void setLtsFlag(Boolean ltsFlag) {
        this.ltsFlag = ltsFlag;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getFamily() {
        return family;
    }

    public void setFamily(String family) {
        this.family = family;
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

    public Set<Host> getServers() {
        return servers;
    }

    public void setServers(Set<Host> servers) {
        this.servers = servers;
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
        if (!(o instanceof OperatingSystem))
            return false;
        OperatingSystem that = (OperatingSystem) o;
        return Objects.equals(id, that.id) &&
                Objects.equals(name, that.name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, name);
    }
}
