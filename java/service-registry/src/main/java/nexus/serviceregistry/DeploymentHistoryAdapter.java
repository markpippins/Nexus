package nexus.serviceregistry;
import nexus.serviceregistry.v1.entity.DeploymentHistory; // legacy

public class DeploymentHistoryAdapter {
  public static nexus.serviceregistry.DeploymentHistory toCanonical(nexus.serviceregistry.v1.entity.DeploymentHistory legacy) {
    if (legacy == null) return null;
    nexus.serviceregistry.DeploymentHistory d = new nexus.serviceregistry.DeploymentHistory(legacy.getId(), legacy.getDeployment(), legacy.getTimestamp(), legacy.getAction());
    d.setNote(legacy.getNote());
    return d;
  }
  public static nexus.serviceregistry.v1.entity.DeploymentHistory fromCanonical(nexus.serviceregistry.DeploymentHistory core) {
    if (core == null) return null;
    nexus.serviceregistry.v1.entity.DeploymentHistory legacy = new nexus.serviceregistry.v1.entity.DeploymentHistory(core.getId(), core.getDeployment(), core.getTimestamp(), core.getAction());
    legacy.setNote(core.getNote());
    return legacy;
  }
}
