package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.Service as LegacyService;

public class ServiceAdapter {
  public static Service toCanonical(LegacyService legacy) {
    if (legacy == null) return null;
    return new Service(legacy.getId(), legacy.getName(), legacy.getActiveFlag());
  }

  public static LegacyService fromCanonical(Service core) {
    if (core == null) return null;
    return new LegacyService(core.getId(), core.getName(), core.getActiveFlag());
  }
}
