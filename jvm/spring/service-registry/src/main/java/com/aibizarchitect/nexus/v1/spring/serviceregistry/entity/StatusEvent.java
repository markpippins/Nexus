package com.aibizarchitect.nexus.v1.spring.serviceregistry.entity;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "status_events", schema = "registry")
public class StatusEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "service_name", nullable = false)
    private String serviceName;

    @Column(name = "old_state", length = 50)
    private String oldState;

    @Column(name = "new_state", nullable = false, length = 50)
    private String newState;

    @Column(name = "reason", length = 255)
    private String reason;

    @Column(name = "response_time_ms")
    private Long responseTimeMs;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "changed_at", nullable = false)
    private LocalDateTime changedAt;

    public StatusEvent() {
    }

    public StatusEvent(String serviceName, String oldState, String newState,
                       String reason, Long responseTimeMs, String errorMessage) {
        this.serviceName = serviceName;
        this.oldState = oldState;
        this.newState = newState;
        this.reason = reason;
        this.responseTimeMs = responseTimeMs;
        this.errorMessage = errorMessage;
        this.changedAt = LocalDateTime.now();
    }

    // Getters and setters

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getServiceName() { return serviceName; }
    public void setServiceName(String serviceName) { this.serviceName = serviceName; }

    public String getOldState() { return oldState; }
    public void setOldState(String oldState) { this.oldState = oldState; }

    public String getNewState() { return newState; }
    public void setNewState(String newState) { this.newState = newState; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }

    public Long getResponseTimeMs() { return responseTimeMs; }
    public void setResponseTimeMs(Long responseTimeMs) { this.responseTimeMs = responseTimeMs; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public LocalDateTime getChangedAt() { return changedAt; }
    public void setChangedAt(LocalDateTime changedAt) { this.changedAt = changedAt; }
}
