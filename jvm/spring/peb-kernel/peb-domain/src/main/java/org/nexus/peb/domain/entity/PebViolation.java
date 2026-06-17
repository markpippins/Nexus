package org.nexus.peb.domain.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.nexus.peb.domain.enums.ViolationResolution;
import org.nexus.peb.domain.enums.ViolationSeverity;
import org.nexus.peb.domain.enums.ViolationType;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "peb_violations")
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

    @Column(columnDefinition = "jsonb")
    private JsonNode context;              // Full request context

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private ViolationResolution resolution; // REJECTED, ROUTED, CLARIFIED

    @Column(nullable = false)
    private Instant createdAt;

    // Getters and Setters omitted for brevity
}
