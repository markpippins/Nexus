package nexus.serviceregistry;

public class ServiceConfigurationAdapter {
  public static ServiceConfiguration toCanonical(nexus.serviceregistry.v1.entity.ServiceConfiguration legacy) {
    if (legacy == null) return null;
    return new ServiceConfiguration(legacy.getId(), legacy.getKey(), legacy.getValue());
  }
  public static nexus.serviceregistry.v1.entity.ServiceConfiguration fromCanonical(ServiceConfiguration core) {
    if (core == null) return null;
    return new nexus.serviceregistry.v1.entity.ServiceConfiguration(core.getId(), core.getKey(), core.getValue());
  }
}
