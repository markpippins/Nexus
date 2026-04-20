package nexus.serviceregistry.v1.entity;

import java.time.LocalDateTime;
import java.util.Objects;

public class Deployment {
  private Long id;
  private Service service;
  private EnvironmentType environment;
  private Host server;
  private String version;
  private LocalDateTime deployedAt;
  private String status;
  private Integer port;
  private String contextPath;
  private String healthCheckUrl;
  private String healthStatus;
  private LocalDateTime lastHealthCheck;
  private String processId;
  private String containerName;
  private String deploymentPath;
  private LocalDateTime startedAt;
  private LocalDateTime stoppedAt;
  private Boolean activeFlag = true;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;

  public Deployment() {}
  // Basic getters/setters
  public Long getId() { return id; }
  public void setId(Long id) { this.id = id; }
  public Service getService() { return service; }
  public void setService(Service service) { this.service = service; }
  public EnvironmentType getEnvironment() { return environment; }
  public void setEnvironment(EnvironmentType environment) { this.environment = environment; }
  public Host getServer() { return server; }
  public void setServer(Host server) { this.server = server; }
  public String getVersion() { return version; }
  public void setVersion(String version) { this.version = version; }
  public LocalDateTime getDeployedAt() { return deployedAt; }
  public void setDeployedAt(LocalDateTime deployedAt) { this.deployedAt = deployedAt; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public Integer getPort() { return port; }
  public void setPort(Integer port) { this.port = port; }
  public String getContextPath() { return contextPath; }
  public void setContextPath(String contextPath) { this.contextPath = contextPath; }
  public String getHealthCheckUrl() { return healthCheckUrl; }
  public void setHealthCheckUrl(String healthCheckUrl) { this.healthCheckUrl = healthCheckUrl; }
  public String getHealthStatus() { return healthStatus; }
  public void setHealthStatus(String healthStatus) { this.healthStatus = healthStatus; }
  public LocalDateTime getLastHealthCheck() { return lastHealthCheck; }
  public void setLastHealthCheck(LocalDateTime lastHealthCheck) { this.lastHealthCheck = lastHealthCheck; }
  public String getProcessId() { return processId; }
  public void setProcessId(String processId) { this.processId = processId; }
  public String getContainerName() { return containerName; }
  public void setContainerName(String containerName) { this.containerName = containerName; }
  public String getDeploymentPath() { return deploymentPath; }
  public void setDeploymentPath(String deploymentPath) { this.deploymentPath = deploymentPath; }
  public LocalDateTime getStartedAt() { return startedAt; }
  public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }
  public LocalDateTime getStoppedAt() { return stoppedAt; }
  public void setStoppedAt(LocalDateTime stoppedAt) { this.stoppedAt = stoppedAt; }
  public Boolean getActiveFlag() { return activeFlag; }
  public void setActiveFlag(Boolean activeFlag) { this.activeFlag = activeFlag; }
  public LocalDateTime getCreatedAt() { return createdAt; }
  public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
  public LocalDateTime getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
  @Override public boolean equals(Object o){ if(this==o) return true; if(!(o instanceof Deployment)) return false; Deployment d=(Deployment)o; return Objects.equals(id,d.id); }
  @Override public int hashCode(){ return Objects.hash(id); }
}
