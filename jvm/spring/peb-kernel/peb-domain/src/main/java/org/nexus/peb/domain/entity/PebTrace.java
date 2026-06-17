package org.nexus.peb.domain.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "peb_traces")
public class PebTrace {

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID transactionId;

    @Column(nullable = false, length = 128)
    private String workRequestId;

    @Column(name = "parent_trace_id")
    private UUID parentTraceId;            // DAG parent

    @Column(nullable = false, length = 64)
    private String stage;                  // Cognitive role or skill

    @Column(columnDefinition = "jsonb")
    private JsonNode inputs;               // State summary at entry

    @Column(columnDefinition = "jsonb")
    private JsonNode causalEntries;        // Why transformation occurred

    @Column(columnDefinition = "jsonb")
    private JsonNode rejectedAlternatives; // Branch points considered

    @Column(nullable = false)
    private Float confidence;              // 0.0–1.0

    @Column(nullable = false, length = 16)
    private String status = "observational"; // ALWAYS observational — enforced

    @Column(nullable = false)
    private Instant createdAt;

    // Getters and Setters omitted for brevity
}
