package nexus.serviceregistry;

public class ServiceAdapter {
  public static Service toCanonical(nexus.serviceregistry.v1.entity.Service legacy) {
    if (legacy == null) return null;
    return new Service(legacy.getId(), legacy.getName(), legacy.getActiveFlag());
  }

  public static nexus.serviceregistry.v1.entity.Service fromCanonical(Service core) {
    if (core == null) return null;
    return new nexus.serviceregistry.v1.entity.Service(core.getId(), core.getName(), core.getActiveFlag());
  }
}
