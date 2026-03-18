package com.angrysurfer.spring.nexus.dto;

import java.util.List;
import java.util.Map;

public class ExternalServiceRegistration {
    private String serviceName;
    private List<String> operations;
    private String endpoint;
    private String healthCheck;
    private Map<String, Object> metadata;
    private String framework;
    private String version;
    private Integer port;
    private List<String> dependencies;
    private List<HostedServiceInfo> hostedServices;

    public ExternalServiceRegistration() {
    }

    public String getServiceName() {
        return serviceName;
    }

    public void setServiceName(String serviceName) {
        this.serviceName = serviceName;
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

    public String getHealthCheck() {
        return healthCheck;
    }

    public void setHealthCheck(String healthCheck) {
        this.healthCheck = healthCheck;
    }

    public Map<String, Object> getMetadata() {
        return metadata;
    }

    public void setMetadata(Map<String, Object> metadata) {
        this.metadata = metadata;
    }

    public String getFramework() {
        return framework;
    }

    public void setFramework(String framework) {
        this.framework = framework;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public Integer getPort() {
        return port;
    }

    public void setPort(Integer port) {
        this.port = port;
    }

    public List<String> getDependencies() {
        return dependencies;
    }

    public void setDependencies(List<String> dependencies) {
        this.dependencies = dependencies;
    }

    public List<HostedServiceInfo> getHostedServices() {
        return hostedServices;
    }

    public void setHostedServices(List<HostedServiceInfo> hostedServices) {
        this.hostedServices = hostedServices;
    }

    public static class HostedServiceInfo {
        private String serviceName;
        private List<String> operations;
        private String framework;
        private String status;
        private String type;
        private String endpoint;
        private String healthCheck;

        public HostedServiceInfo() {
        }

        public String getServiceName() {
            return serviceName;
        }

        public void setServiceName(String serviceName) {
            this.serviceName = serviceName;
        }

        public List<String> getOperations() {
            return operations;
        }

        public void setOperations(List<String> operations) {
            this.operations = operations;
        }

        public String getFramework() {
            return framework;
        }

        public void setFramework(String framework) {
            this.framework = framework;
        }

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public String getEndpoint() {
            return endpoint;
        }

        public void setEndpoint(String endpoint) {
            this.endpoint = endpoint;
        }

        public String getHealthCheck() {
            return healthCheck;
        }

        public void setHealthCheck(String healthCheck) {
            this.healthCheck = healthCheck;
        }
    }
}
