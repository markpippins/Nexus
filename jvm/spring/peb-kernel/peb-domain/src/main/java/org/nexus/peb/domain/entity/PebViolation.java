package org.nexus.peb.domain.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.nexus.peb.domain.enums.ViolationResolution;
import org.nexus.peb.domain.enums.ViolationSeverity;
import org.nexus.peb.domain.enums.ViolationType;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(schema = "peb", name = "violations")
public class PebViolation {

    @Id
    private UUID id;

    @Column(name = "transaction_id")
    private UUID transactionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ViolationType violationType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    private ViolationSeverity severity;

    @Column(length = 128)
    private String entityId;               // Who caused it

    @Column(length = 128)
    private String capabilityAttempted;    // What capability was attempted

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private JsonNode context;              // Full request context

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private ViolationResolution resolution; // REJECTED, ROUTED, CLARIFIED

    @Column(nullable = false)
    private Instant createdAt;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getTransactionId() {
        return transactionId;
    }

    public void setTransactionId(UUID transactionId) {
        this.transactionId = transactionId;
    }

    public ViolationType getViolationType() {
        return violationType;
    }

    public void setViolationType(ViolationType violationType) {
        this.violationType = violationType;
    }

    public ViolationSeverity getSeverity() {
        return severity;
    }

    public void setSeverity(ViolationSeverity severity) {
        this.severity = severity;
    }

    public String getEntityId() {
        return entityId;
    }

    public void setEntityId(String entityId) {
        this.entityId = entityId;
    }

    public String getCapabilityAttempted() {
        return capabilityAttempted;
    }

    public void setCapabilityAttempted(String capabilityAttempted) {
        this.capabilityAttempted = capabilityAttempted;
    }

    public JsonNode getContext() {
        return context;
    }

    public void setContext(JsonNode context) {
        this.context = context;
    }

    public ViolationResolution getResolution() {
        return resolution;
    }

    public void setResolution(ViolationResolution resolution) {
        this.resolution = resolution;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    /**
     * JPA lifecycle callback — Hibernate invokes this immediately before INSERT.
     *
     * <p>Substitutes {@code Instant.now()} for a missing {@code createdAt}
     * so that any INSERT path (current {@code PebViolationEngine.ingest} or
     * a future repository-level call site) satisfies the {@code NOT NULL}
     * constraint on {@code peb.violations.created_at}. Caller-supplied
     * timestamps still win: this method only assigns when {@code createdAt}
     * is currently null.
     *
     * <p>Parallel to the same pattern on
     * {@link PebTransaction#onCreate()} — both entities decided to
     * own their timestamp defaults rather than relying on the orchestration
     * layer to set them.
     */
    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
