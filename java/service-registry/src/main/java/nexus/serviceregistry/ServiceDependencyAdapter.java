package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.ServiceDependency as LegacyDependency;

public class ServiceDependencyAdapter {
  public static ServiceDependency toCanonical(LegacyDependency legacy) {
    if (legacy == null) return null;
    return new ServiceDependency(legacy.getId(), legacy.getName());
  }
  public static LegacyDependency fromCanonical(ServiceDependency core) {
    if (core == null) return null;
    return new LegacyDependency(core.getId(), core.getName());
  }
}
