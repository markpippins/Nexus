package org.nexus.peb.domain.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.nexus.peb.domain.enums.AdmissionResult;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(schema = "peb", name = "transactions")
public class PebTransaction {

    @Id
    private UUID id;

    @Column(unique = true, nullable = false, length = 128)
    private String idempotencyKey;         // Caller-provided — enables safe retry

    @Column(nullable = false, length = 128)
    private String entityId;               // Who initiated

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AdmissionResult admissionResult; // ALLOWED, REJECTED, ROUTED

    @Column(nullable = false, length = 64)
    private String toolName;               // Which MCP facade

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private JsonNode input;                // Full request payload

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private JsonNode output;               // Full response payload

    @Column(length = 64)
    private String beforeHash;             // peb.state hash at begin

    @Column(length = 64)
    private String afterHash;              // peb.state hash at commit (null if rolled back)

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private JsonNode stateDelta;           // Which keys changed + new checksums

    @Column(nullable = false)
    private Instant createdAt;

    @Column
    private Instant committedAt;           // null if rolled back; set by commitTransaction()

    // ── Kernel semantic kernel linkage ──
    @Column
    private UUID kernelEventId;            // event_id from kernel.sys_transition()

    @Column(length = 32)
    private String kernelEventType;        // event_type from kernel.sys_transition()

    // Getters/Setters — only the ones the kernel dispatch layer actually needs
    // are wired in; the rest stay absent to keep the entity narrow. Jackson
    // deserializes the rest via the application.yml visibility: any config.

    public UUID getId() {
        return id;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public String getEntityId() {
        return entityId;
    }

    public String getToolName() {
        return toolName;
    }

    public JsonNode getInput() {
        return input;
    }

    public AdmissionResult getAdmissionResult() {
        return admissionResult;
    }

    public void setAdmissionResult(AdmissionResult admissionResult) {
        this.admissionResult = admissionResult;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getCommittedAt() {
        return committedAt;
    }

    public void setCommittedAt(Instant committedAt) {
        this.committedAt = committedAt;
    }

    public UUID getKernelEventId() {
        return kernelEventId;
    }

    public void setKernelEventId(UUID kernelEventId) {
        this.kernelEventId = kernelEventId;
    }

    public String getKernelEventType() {
        return kernelEventType;
    }

    public void setKernelEventType(String kernelEventType) {
        this.kernelEventType = kernelEventType;
    }

    /**
     * JPA lifecycle callback — Hibernate invokes this immediately before INSERT.
     *
     * <p>Substitutes {@code Instant.now()} for a missing {@code createdAt}
     * so that caller-supplied payloads which omit the timestamp (the MCP
     * facade in {@code typescript/peb-mcp} does not stamp one) still satisfy
     * the {@code NOT NULL} constraint on {@code peb.transactions.created_at}.
     * This belongs on the entity rather than the dispatch engine so every
     * INSERT path — current and future — gets the default, including
     * repository-level call sites that bypass
     * {@link org.nexus.peb.core.engine.PebGovernanceEngine}.
     *
     * <p>Also assigns {@link #id} when null. The identifier is declared with
     * {@code @Id} but no {@code @GeneratedValue}: the kernel historically
     * relied on a pre-assigned UUID that no dispatch path ever set, so every
     * insert crashed with
     * {@code IdentifierGenerationException: must be manually assigned before
     * calling 'persist()'}. Defaulting here — exactly like {@code createdAt} —
     * makes every insert path self-sufficient.
     *
     * <p>Caller-supplied values still win: this method only assigns
     * when the field is currently null.
     */
    @PrePersist
    protected void onCreate() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
