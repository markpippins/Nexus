package org.nexus.peb.domain.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.nexus.peb.domain.enums.DecisionStatus;
import org.nexus.peb.domain.enums.EntropyClass;

import jakarta.persistence.ManyToOne;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.FetchType;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "peb_decisions")
public class PebDecision {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "transaction_id", nullable = false)
    private PebTransaction transaction;    // Links to producing transaction

    @Column(length = 32)
    private String adrNumber;              // "ADR-007"

    @Column(nullable = false, length = 256)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private DecisionStatus status;         // DRAFT, ACCEPTED, SUPERSEDED, REJECTED

    @Column(columnDefinition = "jsonb")
    private JsonNode summary;              // Structured rationale

    @Column(columnDefinition = "text[]")
    private List<String> affectedKeys;     // Which peb_state keys changed

    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    private EntropyClass entropyClass;     // COLLAPSER, SHAPER, NEUTRAL

    @Column(length = 64)
    private String beforeHash;             // peb_state_hash at transaction start

    @Column(length = 64)
    private String afterHash;              // peb_state_hash after commit

    @Column(nullable = false, length = 128)
    private String authorId;

    @Column(name = "parent_decision_id")
    private UUID parentDecisionId;         // Merkle link to previous decision

    @Column(name = "rollback_of")
    private UUID rollbackOf;               // If this rolls back a prior decision

    @Column(nullable = false)
    private Instant createdAt;

    // Getters and Setters omitted for brevity
}
