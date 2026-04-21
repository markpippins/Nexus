package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.ServiceType as LegacyType;

public class ServiceTypeAdapter {
  public static ServiceType toCanonical(LegacyType legacy) {
    if (legacy == null) return null;
    return new ServiceType(legacy.getId(), legacy.getName());
  }
  public static LegacyType fromCanonical(ServiceType core) {
    if (core == null) return null;
    return new LegacyType(core.getId(), core.getName());
  }
}
