package nexus.serviceregistry.v1.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "visual_components")
public class VisualComponent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String type; // The unique slug, e.g., 'rest-api'

    @Column(nullable = false)
    private String name; // Display label

    @Column(columnDefinition = "TEXT")
    private String description;

    // 3D Visual Properties
    @Column(nullable = false)
    private String geometry; // sphere, cylinder, etc.

    @Column(name = "default_color", nullable = false)
    private Long defaultColor; // Hex color as number

    @Column(nullable = false)
    private Double scale;

    // UI Palette Properties
    @Column(name = "icon_class")
    private String iconClass;

    @Column(name = "color_class")
    private String colorClass;

    @Column(name = "is_system")
    private Boolean isSystem = false;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public VisualComponent() {
    }

    public VisualComponent(Long id, String type, String name, String description, String geometry, Long defaultColor,
            Double scale, String iconClass, String colorClass, Boolean isSystem, LocalDateTime createdAt,
            LocalDateTime updatedAt) {
        this.id = id;
        this.type = type;
        this.name = name;
        this.description = description;
        this.geometry = geometry;
        this.defaultColor = defaultColor;
        this.scale = scale;
        this.iconClass = iconClass;
        this.colorClass = colorClass;
        this.isSystem = isSystem;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
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

    public String getGeometry() {
        return geometry;
    }

    public void setGeometry(String geometry) {
        this.geometry = geometry;
    }

    public Long getDefaultColor() {
        return defaultColor;
    }

    public void setDefaultColor(Long defaultColor) {
        this.defaultColor = defaultColor;
    }

    public Double getScale() {
        return scale;
    }

    public void setScale(Double scale) {
        this.scale = scale;
    }

    public String getIconClass() {
        return iconClass;
    }

    public void setIconClass(String iconClass) {
        this.iconClass = iconClass;
    }

    public String getColorClass() {
        return colorClass;
    }

    public void setColorClass(String colorClass) {
        this.colorClass = colorClass;
    }

    public Boolean getIsSystem() {
        return isSystem;
    }

    public void setIsSystem(Boolean isSystem) {
        this.isSystem = isSystem;
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
}
