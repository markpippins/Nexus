package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.EnvironmentType as LegacyEnvironmentType;

public class EnvironmentTypeAdapter {
  public static EnvironmentType toCanonical(LegacyEnvironmentType legacy) {
    if (legacy == null) return null;
    EnvironmentType core = new EnvironmentType(legacy.getId(), legacy.getName(), legacy.getActiveFlag());
    return core;
  }

  public static LegacyEnvironmentType fromCanonical(EnvironmentType core) {
    if (core == null) return null;
    LegacyEnvironmentType legacy = new LegacyEnvironmentType(core.getId(), core.getName());
    legacy.setActiveFlag(core.getActiveFlag());
    return legacy;
  }
}
