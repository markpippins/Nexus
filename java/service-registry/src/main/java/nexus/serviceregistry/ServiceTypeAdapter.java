package nexus.serviceregistry;
public class ServiceTypeAdapter {
  public static ServiceType toCanonical(nexus.serviceregistry.v1.entity.ServiceType legacy) {
    if (legacy == null) return null;
    return new ServiceType(legacy.getId(), legacy.getName());
  }
  public static nexus.serviceregistry.v1.entity.ServiceType fromCanonical(ServiceType core) {
    if (core == null) return null;
    return new nexus.serviceregistry.v1.entity.ServiceType(core.getId(), core.getName());
  }
}
