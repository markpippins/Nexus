package com.aibizarchitect.nexus.v1.spring.atlas.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "graph_view_connections", schema = "registry",
       uniqueConstraints = @UniqueConstraint(columnNames = {"graph_view_id", "source_node_id", "target_node_id"}))
public class GraphViewConnection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "graph_view_id", nullable = false)
    private GraphView graphView;

    @Column(name = "source_node_id", nullable = false)
    private String sourceNodeId;

    @Column(name = "target_node_id", nullable = false)
    private String targetNodeId;

    @Column(name = "direction", nullable = false, length = 20)
    private String direction; // OUTBOUND or BIDIRECTIONAL

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public GraphViewConnection() {
    }

    public GraphViewConnection(String sourceNodeId, String targetNodeId, String direction) {
        this.sourceNodeId = sourceNodeId;
        this.targetNodeId = targetNodeId;
        this.direction = direction;
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

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    @JsonIgnore
    public GraphView getGraphView() { return graphView; }
    public void setGraphView(GraphView graphView) { this.graphView = graphView; }

    public String getSourceNodeId() { return sourceNodeId; }
    public void setSourceNodeId(String sourceNodeId) { this.sourceNodeId = sourceNodeId; }

    public String getTargetNodeId() { return targetNodeId; }
    public void setTargetNodeId(String targetNodeId) { this.targetNodeId = targetNodeId; }

    public String getDirection() { return direction; }
    public void setDirection(String direction) { this.direction = direction; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
