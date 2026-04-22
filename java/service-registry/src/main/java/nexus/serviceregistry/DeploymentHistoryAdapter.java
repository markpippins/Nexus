package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.DeploymentHistory as Legacy;

public class DeploymentHistoryAdapter {
  public static DeploymentHistory toCanonical(Legacy legacy) {
    if (legacy == null) return null;
    DeploymentHistory d = new DeploymentHistory(legacy.getId(), legacy.getDeployment(), legacy.getTimestamp(), legacy.getAction());
    d.setNote(legacy.getNote());
    return d;
  }
  public static Legacy fromCanonical(DeploymentHistory core) {
    if (core == null) return null;
    Legacy legacy = new Legacy(core.getId(), core.getDeployment(), core.getTimestamp(), core.getAction());
    legacy.setNote(core.getNote());
    return legacy;
  }
}
