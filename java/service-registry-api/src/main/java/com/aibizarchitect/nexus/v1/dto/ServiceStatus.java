package com.aibizarchitect.nexus.v1.dto;

import java.io.Serializable;
import java.time.Instant;
import java.util.Map;

public class ServiceStatus implements Serializable {

    private static final long serialVersionUID = 1L;

    /** Service unique identifier (from database) */
    private Long serviceId;

    /** Service name for quick lookup */
    private String serviceName;

    /** Current health status */
    private HealthState healthState;

    /** Last heartbeat timestamp */
    private Instant lastHeartbeat;

    /** Last health check timestamp */
    private Instant lastHealthCheck;

    /** Service endpoint URL */
    private String endpoint;

    /** Response time in milliseconds from last health check */
    private Long responseTimeMs;

    /** Number of active connections/requests */
    private Integer activeConnections;

    /** Custom metrics from the service */
    private Map<String, Object> metrics;

    /** Error message if unhealthy */
    private String errorMessage;

    /** Whether this status was published via pub/sub */
    private boolean published;

    public ServiceStatus() {
    }

    public ServiceStatus(Long serviceId, String serviceName, HealthState healthState, Instant lastHeartbeat,
            Instant lastHealthCheck, String endpoint, Long responseTimeMs, Integer activeConnections,
            Map<String, Object> metrics, String errorMessage, boolean published) {
        this.serviceId = serviceId;
        this.serviceName = serviceName;
        this.healthState = healthState;
        this.lastHeartbeat = lastHeartbeat;
        this.lastHealthCheck = lastHealthCheck;
        this.endpoint = endpoint;
        this.responseTimeMs = responseTimeMs;
        this.activeConnections = activeConnections;
        this.metrics = metrics;
        this.errorMessage = errorMessage;
        this.published = published;
    }

    public Long getServiceId() {
        return serviceId;
    }

    public void setServiceId(Long serviceId) {
        this.serviceId = serviceId;
    }

    public String getServiceName() {
        return serviceName;
    }

    public void setServiceName(String serviceName) {
        this.serviceName = serviceName;
    }

    public HealthState getHealthState() {
        return healthState;
    }

    public void setHealthState(HealthState healthState) {
        this.healthState = healthState;
    }

    public Instant getLastHeartbeat() {
        return lastHeartbeat;
    }

    public void setLastHeartbeat(Instant lastHeartbeat) {
        this.lastHeartbeat = lastHeartbeat;
    }

    public Instant getLastHealthCheck() {
        return lastHealthCheck;
    }

    public void setLastHealthCheck(Instant lastHealthCheck) {
        this.lastHealthCheck = lastHealthCheck;
    }

    public String getEndpoint() {
        return endpoint;
    }

    public void setEndpoint(String endpoint) {
        this.endpoint = endpoint;
    }

    public Long getResponseTimeMs() {
        return responseTimeMs;
    }

    public void setResponseTimeMs(Long responseTimeMs) {
        this.responseTimeMs = responseTimeMs;
    }

    public Integer getActiveConnections() {
        return activeConnections;
    }

    public void setActiveConnections(Integer activeConnections) {
        this.activeConnections = activeConnections;
    }

    public Map<String, Object> getMetrics() {
        return metrics;
    }

    public void setMetrics(Map<String, Object> metrics) {
        this.metrics = metrics;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public boolean isPublished() {
        return published;
    }

    public void setPublished(boolean published) {
        this.published = published;
    }

    public static ServiceStatusBuilder builder() {
        return new ServiceStatusBuilder();
    }

    public static class ServiceStatusBuilder {
        private Long serviceId;
        private String serviceName;
        private HealthState healthState;
        private Instant lastHeartbeat;
        private Instant lastHealthCheck;
        private String endpoint;
        private Long responseTimeMs;
        private Integer activeConnections;
        private Map<String, Object> metrics;
        private String errorMessage;
        private boolean published;

        ServiceStatusBuilder() {
        }

        public ServiceStatusBuilder serviceId(Long serviceId) {
            this.serviceId = serviceId;
            return this;
        }

        public ServiceStatusBuilder serviceName(String serviceName) {
            this.serviceName = serviceName;
            return this;
        }

        public ServiceStatusBuilder healthState(HealthState healthState) {
            this.healthState = healthState;
            return this;
        }

        public ServiceStatusBuilder lastHeartbeat(Instant lastHeartbeat) {
            this.lastHeartbeat = lastHeartbeat;
            return this;
        }

        public ServiceStatusBuilder lastHealthCheck(Instant lastHealthCheck) {
            this.lastHealthCheck = lastHealthCheck;
            return this;
        }

        public ServiceStatusBuilder endpoint(String endpoint) {
            this.endpoint = endpoint;
            return this;
        }

        public ServiceStatusBuilder responseTimeMs(Long responseTimeMs) {
            this.responseTimeMs = responseTimeMs;
            return this;
        }

        public ServiceStatusBuilder activeConnections(Integer activeConnections) {
            this.activeConnections = activeConnections;
            return this;
        }

        public ServiceStatusBuilder metrics(Map<String, Object> metrics) {
            this.metrics = metrics;
            return this;
        }

        public ServiceStatusBuilder errorMessage(String errorMessage) {
            this.errorMessage = errorMessage;
            return this;
        }

        public ServiceStatusBuilder published(boolean published) {
            this.published = published;
            return this;
        }

        public ServiceStatus build() {
            return new ServiceStatus(serviceId, serviceName, healthState, lastHeartbeat, lastHealthCheck, endpoint,
                    responseTimeMs, activeConnections, metrics, errorMessage, published);
        }

        public String toString() {
            return "ServiceStatus.ServiceStatusBuilder(serviceId=" + this.serviceId + ", serviceName="
                    + this.serviceName + ", healthState=" + this.healthState + ", lastHeartbeat=" + this.lastHeartbeat
                    + ", lastHealthCheck=" + this.lastHealthCheck + ", endpoint=" + this.endpoint + ", responseTimeMs="
                    + this.responseTimeMs + ", activeConnections=" + this.activeConnections + ", metrics="
                    + this.metrics + ", errorMessage=" + this.errorMessage + ", published=" + this.published + ")";
        }
    }

    public enum HealthState {
        HEALTHY,
        UNHEALTHY,
        DEGRADED,
        UNKNOWN,
        OFFLINE,
        STARTING,
        STOPPING
    }

    /**
     * Check if the service is considered stale (no heartbeat in threshold)
     */
    public boolean isStale(long thresholdSeconds) {
        if (lastHeartbeat == null) {
            return true;
        }
        return Instant.now().minusSeconds(thresholdSeconds).isAfter(lastHeartbeat);
    }

    /**
     * Create a status for a newly registered service
     */
    public static ServiceStatus createInitial(Long serviceId, String serviceName, String endpoint) {
        return ServiceStatus.builder()
                .serviceId(serviceId)
                .serviceName(serviceName)
                .endpoint(endpoint)
                .healthState(HealthState.UNKNOWN)
                .lastHeartbeat(Instant.now())
                .build();
    }

    /**
     * Create an offline status
     */
    public static ServiceStatus createOffline(Long serviceId, String serviceName) {
        return ServiceStatus.builder()
                .serviceId(serviceId)
                .serviceName(serviceName)
                .healthState(HealthState.OFFLINE)
                .lastHeartbeat(null)
                .build();
    }
}
