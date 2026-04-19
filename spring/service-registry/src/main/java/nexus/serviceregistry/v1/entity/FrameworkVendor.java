/**
 * Deprecated: This class has moved to com.aibizarchitect.nexus.core adapters.
 * This class remains for backward compatibility during migration.
 */
package nexus.serviceregistry.v1.entity;

import jakarta.persistence.*;

@Deprecated
@Entity
@Table(name = "vendors")
public class FrameworkVendor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(length = 1000)
    private String description;

    @Column
    private String url;

    @Column(name = "active_flag")
    private Boolean activeFlag = true;

    public FrameworkVendor() {
    }

    public FrameworkVendor(Long id, String name, String description, String url, Boolean activeFlag) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.url = url;
        this.activeFlag = activeFlag;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
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
}
