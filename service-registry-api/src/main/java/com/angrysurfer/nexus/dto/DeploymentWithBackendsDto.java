package com.angrysurfer.nexus.dto;

import java.util.List;

/**
 * DTO representing a deployment with its backend connections
 * Used for detailed deployment view in admin UI
 */
public class DeploymentWithBackendsDto {
    private Long id;
    private String serviceName;
    private String serverHostname;
    private Integer port;
    private String version;
    private String status;
    private String environment;

    // Backend connections
    private List<ServiceBackendDto> backends;

    // Services that use this deployment as a backend
    private List<ServiceBackendDto> consumers;

    public DeploymentWithBackendsDto() {
    }

    public DeploymentWithBackendsDto(Long id, String serviceName, String serverHostname, Integer port, String version,
            String status, String environment, List<ServiceBackendDto> backends, List<ServiceBackendDto> consumers) {
        this.id = id;
        this.serviceName = serviceName;
        this.serverHostname = serverHostname;
        this.port = port;
        this.version = version;
        this.status = status;
        this.environment = environment;
        this.backends = backends;
        this.consumers = consumers;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getServiceName() {
        return serviceName;
    }

    public void setServiceName(String serviceName) {
        this.serviceName = serviceName;
    }

    public String getServerHostname() {
        return serverHostname;
    }

    public void setServerHostname(String serverHostname) {
        this.serverHostname = serverHostname;
    }

    public Integer getPort() {
        return port;
    }

    public void setPort(Integer port) {
        this.port = port;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getEnvironment() {
        return environment;
    }

    public void setEnvironment(String environment) {
        this.environment = environment;
    }

    public List<ServiceBackendDto> getBackends() {
        return backends;
    }

    public void setBackends(List<ServiceBackendDto> backends) {
        this.backends = backends;
    }

    public List<ServiceBackendDto> getConsumers() {
        return consumers;
    }

    public void setConsumers(List<ServiceBackendDto> consumers) {
        this.consumers = consumers;
    }
}
