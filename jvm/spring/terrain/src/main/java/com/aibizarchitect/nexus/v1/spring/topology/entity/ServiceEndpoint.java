package com.aibizarchitect.nexus.v1.spring.topology.entity;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * T25 1.3 (R-A-2026-08-15-008) — instance-lookup endpoint rows.
 *
 * Unit-name keyed (logical identity = &lt;UNIT&gt;), IP first-class from day
 * one. Additive and backwards-compatible; nothing existing is touched.
 * Credential discipline: this row deliberately has NO sysUser/sysPass —
 * the lookup DTO is credential-free by construction.
 */
@Entity
@Table(name = "service_endpoints",
       uniqueConstraints = @UniqueConstraint(name = "uq_service_endpoints_unit_instance",
                                             columnNames = { "unit", "instance" }))
@JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
public class ServiceEndpoint {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String unit;

    @Column(nullable = false)
    private String instance = "primary";

    @Column(nullable = false)
    private String host;

    @Column(nullable = false, columnDefinition = "inet")
    private String ip;

    @Column(nullable = false)
    private Integer port;

    @Column(nullable = false)
    private String scheme = "http";

    @Column(nullable = false)
    private String status = "UNKNOWN";

    @Column(name = "last_heartbeat")
    private OffsetDateTime lastHeartbeat;

    public ServiceEndpoint() {
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public String getInstance() {
        return instance;
    }

    public void setInstance(String instance) {
        this.instance = instance;
    }

    public String getHost() {
        return host;
    }

    public void setHost(String host) {
        this.host = host;
    }

    public String getIp() {
        return ip;
    }

    public void setIp(String ip) {
        this.ip = ip;
    }

    public Integer getPort() {
        return port;
    }

    public void setPort(Integer port) {
        this.port = port;
    }

    public String getScheme() {
        return scheme;
    }

    public void setScheme(String scheme) {
        this.scheme = scheme;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public OffsetDateTime getLastHeartbeat() {
        return lastHeartbeat;
    }

    public void setLastHeartbeat(OffsetDateTime lastHeartbeat) {
        this.lastHeartbeat = lastHeartbeat;
    }
}
