package com.aibizarchitect.nexus.v1.broker.api;

import java.io.Serializable;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

public class ServiceRegistration implements Serializable {

    private static final long serialVersionUID = 1L;

    @NotBlank(message = "Service name is required")
    private String serviceName;

    @NotEmpty(message = "At least one operation is required")
    private List<String> operations;

    @NotBlank(message = "Endpoint URL is required")
    private String endpoint;

    @NotBlank(message = "Health check URL is required")
    private String healthCheck;

    private Map<String, Object> metadata;
    private Instant lastHeartbeat;
    private ServiceStatus status;

    public String getServiceName() {
        return serviceName;
    }

    public void setServiceName(String serviceName) {
        this.serviceName = serviceName;
    }

    public Map<String, Object> getMetadata() {
        return metadata;
    }

    public Instant getLastHeartbeat() {
        return lastHeartbeat;
    }

    public void setLastHeartbeat(Instant lastHeartbeat) {
        this.lastHeartbeat = lastHeartbeat;
    }

    public String getHealthCheck() {
        return healthCheck;
    }

    public void setHealthCheck(String healthCheck) {
        this.healthCheck = healthCheck;
    }

    public List<String> getOperations() {
        return operations;
    }

    public void setOperations(List<String> operations) {
        this.operations = operations;
    }

    public String getEndpoint() {
        return endpoint;
    }

    public void setEndpoint(String endpoint) {
        this.endpoint = endpoint;
    }

    public ServiceStatus getStatus() {
        return status;
    }

    public void setStatus(ServiceStatus status) {
        this.status = status;
    }

    public enum ServiceStatus {
        HEALTHY, UNHEALTHY, UNKNOWN
    }
}
