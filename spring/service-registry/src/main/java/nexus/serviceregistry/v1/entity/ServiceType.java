package nexus.serviceregistry.v1.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "service_types")
public class ServiceType {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(length = 1000)
    private String description;

    @Column(name = "active_flag")
    private Boolean activeFlag = true;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "default_component_id")
    private VisualComponent defaultComponent;

    public ServiceType() {
    }

    public ServiceType(Long id, String name, String description, Boolean activeFlag, VisualComponent defaultComponent) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.activeFlag = activeFlag;
        this.defaultComponent = defaultComponent;
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

    public Boolean getActiveFlag() {
        return activeFlag;
    }

    public void setActiveFlag(Boolean activeFlag) {
        this.activeFlag = activeFlag;
    }

    public VisualComponent getDefaultComponent() {
        return defaultComponent;
    }

    public void setDefaultComponent(VisualComponent defaultComponent) {
        this.defaultComponent = defaultComponent;
    }
}
