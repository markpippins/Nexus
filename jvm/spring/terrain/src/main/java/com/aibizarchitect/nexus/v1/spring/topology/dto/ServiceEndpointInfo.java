package com.aibizarchitect.nexus.v1.spring.topology.dto;

import java.time.OffsetDateTime;

/**
 * T25 1.3 lookup — one reachable endpoint for a unit.
 * Credential-free by construction (no sysUser/sysPass ever leaves terrain).
 */
public class ServiceEndpointInfo {

    private String instance;
    private String host;
    private String ip;
    private Integer port;
    private String scheme;
    private String status;
    private OffsetDateTime lastHeartbeat;

    public ServiceEndpointInfo() {
    }

    public ServiceEndpointInfo(String instance, String host, String ip, Integer port, String scheme,
            String status, OffsetDateTime lastHeartbeat) {
        this.instance = instance;
        this.host = host;
        this.ip = ip;
        this.port = port;
        this.scheme = scheme;
        this.status = status;
        this.lastHeartbeat = lastHeartbeat;
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
