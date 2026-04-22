package nexus.serviceregistry;
import nexus.serviceregistry.v1.entity.ServiceDependency; // Legacy type

public class ServiceDependencyAdapter {
  public static ServiceDependency toCanonical(nexus.serviceregistry.v1.entity.ServiceDependency legacy) {
    if (legacy == null) return null;
    return new ServiceDependency(legacy.getId(), legacy.getName());
  }
  public static nexus.serviceregistry.v1.entity.ServiceDependency fromCanonical(ServiceDependency core) {
    if (core == null) return null;
    return new nexus.serviceregistry.v1.entity.ServiceDependency(core.getId(), core.getName());
  }
}
