package nexus.serviceregistry;

import java.time.LocalDateTime;

public class DeploymentAdapter {
  public static nexus.serviceregistry.Deployment toCanonical(nexus.serviceregistry.v1.entity.Deployment legacy) {
    if (legacy == null) return null;
    nexus.serviceregistry.Deployment core = new nexus.serviceregistry.Deployment();
    core.setId(legacy.getId());
    // naive mapping: copy common fields if present
    core.setServiceId(legacy.getService() != null ? legacy.getService().getId() : null);
    core.setEnvironmentId(legacy.getEnvironment() != null ? legacy.getEnvironment().getId() : null);
    core.setHostId(legacy.getServer() != null ? legacy.getServer().getId() : null);
    core.setVersion(legacy.getVersion());
    core.setDeployedAt(legacy.getDeployedAt());
    core.setStatus(legacy.getStatus());
    core.setPort(legacy.getPort());
    core.setContextPath(legacy.getContextPath());
    core.setHealthCheckUrl(legacy.getHealthCheckUrl());
    core.setHealthStatus(legacy.getHealthStatus());
    core.setLastHealthCheck(legacy.getLastHealthCheck());
    core.setProcessId(legacy.getProcessId());
    core.setContainerName(legacy.getContainerName());
    core.setDeploymentPath(legacy.getDeploymentPath());
    core.setStartedAt(legacy.getStartedAt());
    core.setStoppedAt(legacy.getStoppedAt());
    core.setActiveFlag(legacy.getActiveFlag());
    core.setCreatedAt(legacy.getCreatedAt());
    core.setUpdatedAt(legacy.getUpdatedAt());
    return core;
  }

  public static nexus.serviceregistry.v1.entity.Deployment fromCanonical(nexus.serviceregistry.Deployment core) {
    if (core == null) return null;
    nexus.serviceregistry.v1.entity.Deployment legacy = new nexus.serviceregistry.v1.entity.Deployment();
    legacy.setId(core.getId());
    // conservative; mapping of IDs only for skeletal migration
    // Additional fields can be added as needed
    return legacy;
  }
}
