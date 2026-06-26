package org.nexus.peb.domain.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(schema = "peb", name = "capabilities")
public class PebCapability {

    @Id
    private UUID id;

    @Column(nullable = false, length = 128)
    private String entityId;               // Agent, service, or human

    @Column(nullable = false, length = 128)
    private String capability;             // "cap:emit_work_request", "cap:mutate_state:key=invariants"

    @Column(length = 128)
    private String grantedBy;              // Who granted this capability

    @Column
    private Instant expiresAt;             // Optional TTL

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private boolean active = true;         // Soft revocation

    // Getters and Setters omitted for brevity
}
