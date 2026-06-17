package org.nexus.peb.domain.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.nexus.peb.domain.enums.AdmissionResult;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "peb_transactions")
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

    @Column(columnDefinition = "jsonb", nullable = false)
    private JsonNode input;                // Full request payload

    @Column(columnDefinition = "jsonb")
    private JsonNode output;               // Full response payload

    @Column(length = 64)
    private String beforeHash;             // peb_state_hash at begin

    @Column(length = 64)
    private String afterHash;              // peb_state_hash at commit (null if rolled back)

    @Column(columnDefinition = "jsonb")
    private JsonNode stateDelta;           // Which keys changed + new checksums

    @Column(nullable = false)
    private Instant createdAt;

    @Column
    private Instant committedAt;           // null if rolled back

    // Getters and Setters omitted for brevity
}
