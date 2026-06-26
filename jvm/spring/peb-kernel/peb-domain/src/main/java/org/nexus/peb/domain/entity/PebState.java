package org.nexus.peb.domain.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(schema = "peb", name = "state")
public class PebState {

    @Id
    private UUID id;

    @Column(unique = true, nullable = false, length = 64)
    private String key;                    // "invariants", "architecture", "trajectory", "intent"

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private JsonNode content;              // Structured state

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private JsonNode metadata;             // { "version", "author", "updatedAt" }

    @Column(length = 64, nullable = false)
    private String checksum;               // SHA-256 of content (independent per key)

    @Version
    private Long version;                  // Optimistic lock — monotonic counter

    @Column(nullable = false, columnDefinition = "timestamp with time zone")
    private Instant createdAt;

    @Column(nullable = false, columnDefinition = "timestamp with time zone")
    private Instant updatedAt;

    // Getters and Setters

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public JsonNode getContent() { return content; }
    public void setContent(JsonNode content) { this.content = content; }

    public JsonNode getMetadata() { return metadata; }
    public void setMetadata(JsonNode metadata) { this.metadata = metadata; }

    public String getChecksum() { return checksum; }
    public void setChecksum(String checksum) { this.checksum = checksum; }

    public Long getVersion() { return version; }
    public void setVersion(Long version) { this.version = version; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
