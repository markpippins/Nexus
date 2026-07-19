package com.aibizarchitect.nexus.v1.spring.atlas.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "graph_views", schema = "registry")
public class GraphView {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "camera_position_x", nullable = false)
    private Double cameraPositionX = 0.0;

    @Column(name = "camera_position_y", nullable = false)
    private Double cameraPositionY = 40.0;

    @Column(name = "camera_position_z", nullable = false)
    private Double cameraPositionZ = 120.0;

    @Column(name = "camera_target_x", nullable = false)
    private Double cameraTargetX = 0.0;

    @Column(name = "camera_target_y", nullable = false)
    private Double cameraTargetY = 15.0;

    @Column(name = "camera_target_z", nullable = false)
    private Double cameraTargetZ = 0.0;

    // --- Camera 2 (secondary viewpoint) ---

    @Column(name = "camera2_position_x", nullable = false)
    private Double camera2PositionX = 0.0;

    @Column(name = "camera2_position_y", nullable = false)
    private Double camera2PositionY = 40.0;

    @Column(name = "camera2_position_z", nullable = false)
    private Double camera2PositionZ = 120.0;

    @Column(name = "camera2_target_x", nullable = false)
    private Double camera2TargetX = 0.0;

    @Column(name = "camera2_target_y", nullable = false)
    private Double camera2TargetY = 15.0;

    @Column(name = "camera2_target_z", nullable = false)
    private Double camera2TargetZ = 0.0;

    @Column(name = "is_default", nullable = false)
    private Boolean isDefault = false;

    @OneToMany(mappedBy = "graphView", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<GraphViewPosition> positions = new ArrayList<>();

    @OneToMany(mappedBy = "graphView", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<GraphViewConnection> connections = new ArrayList<>();

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;


    public GraphView() {
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

    // --- Getters and Setters ---

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Double getCameraPositionX() { return cameraPositionX; }
    public void setCameraPositionX(Double cameraPositionX) { this.cameraPositionX = cameraPositionX; }

    public Double getCameraPositionY() { return cameraPositionY; }
    public void setCameraPositionY(Double cameraPositionY) { this.cameraPositionY = cameraPositionY; }

    public Double getCameraPositionZ() { return cameraPositionZ; }
    public void setCameraPositionZ(Double cameraPositionZ) { this.cameraPositionZ = cameraPositionZ; }

    public Double getCameraTargetX() { return cameraTargetX; }
    public void setCameraTargetX(Double cameraTargetX) { this.cameraTargetX = cameraTargetX; }

    public Double getCameraTargetY() { return cameraTargetY; }
    public void setCameraTargetY(Double cameraTargetY) { this.cameraTargetY = cameraTargetY; }

    public Double getCameraTargetZ() { return cameraTargetZ; }
    public void setCameraTargetZ(Double cameraTargetZ) { this.cameraTargetZ = cameraTargetZ; }

    // --- Camera 2 getters/setters ---

    public Double getCamera2PositionX() { return camera2PositionX; }
    public void setCamera2PositionX(Double camera2PositionX) { this.camera2PositionX = camera2PositionX; }

    public Double getCamera2PositionY() { return camera2PositionY; }
    public void setCamera2PositionY(Double camera2PositionY) { this.camera2PositionY = camera2PositionY; }

    public Double getCamera2PositionZ() { return camera2PositionZ; }
    public void setCamera2PositionZ(Double camera2PositionZ) { this.camera2PositionZ = camera2PositionZ; }

    public Double getCamera2TargetX() { return camera2TargetX; }
    public void setCamera2TargetX(Double camera2TargetX) { this.camera2TargetX = camera2TargetX; }

    public Double getCamera2TargetY() { return camera2TargetY; }
    public void setCamera2TargetY(Double camera2TargetY) { this.camera2TargetY = camera2TargetY; }

    public Double getCamera2TargetZ() { return camera2TargetZ; }
    public void setCamera2TargetZ(Double camera2TargetZ) { this.camera2TargetZ = camera2TargetZ; }

    public Boolean getIsDefault() { return isDefault; }
    public void setIsDefault(Boolean isDefault) { this.isDefault = isDefault; }

    public List<GraphViewPosition> getPositions() { return positions; }
    public void setPositions(List<GraphViewPosition> positions) { this.positions = positions; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public List<GraphViewConnection> getConnections() { return connections; }
    public void setConnections(List<GraphViewConnection> connections) { this.connections = connections; }
}
