package com.aibizarchitect.nexus.v1.dto;

import java.util.Map;

/**
 * Optional payload for heartbeat requests.
 * Services can include metadata about their current state.
 *
 * Example POST body:
 * {
 *   "version": "1.2.3",
 *   "build": "abc123",
 *   "metrics": {
 *     "memoryMb": 256,
 *     "cpuPercent": 12.5,
 *     "activeConnections": 42
 *   }
 * }
 */
public class HeartbeatPayload {

    /** Semantic version of the service (e.g., "1.2.3") */
    private String version;

    /** Build identifier (git SHA, build number, etc.) */
    private String build;

    /** Custom metrics reported by the service */
    private Map<String, Object> metrics;

    public HeartbeatPayload() {
    }

    public HeartbeatPayload(String version, String build, Map<String, Object> metrics) {
        this.version = version;
        this.build = build;
        this.metrics = metrics;
    }

    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }

    public String getBuild() { return build; }
    public void setBuild(String build) { this.build = build; }

    public Map<String, Object> getMetrics() { return metrics; }
    public void setMetrics(Map<String, Object> metrics) { this.metrics = metrics; }
}
