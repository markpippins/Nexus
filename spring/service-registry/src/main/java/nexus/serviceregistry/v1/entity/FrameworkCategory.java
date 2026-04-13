package nexus.serviceregistry.v1.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "categories")
public class FrameworkCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(name = "active_flag")
    private Boolean activeFlag = true;

    public FrameworkCategory() {
    }

    public FrameworkCategory(Long id, String name, Boolean activeFlag) {
        this.id = id;
        this.name = name;
        this.activeFlag = activeFlag;
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

    // Methods needed for backward compatibility with controllers and services
    public String getDescription() {
        // This field was removed, returning null for now
        return null;
    }

    public void setDescription(String description) {
        // This field was removed, doing nothing for now
    }
}
