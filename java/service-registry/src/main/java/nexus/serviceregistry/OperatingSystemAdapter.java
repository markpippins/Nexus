package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.OperatingSystem as LegacyOS;

public class OperatingSystemAdapter {
  public static OperatingSystem toCanonical(LegacyOS legacy) {
    if (legacy == null) return null;
    return new OperatingSystem(legacy.getId(), legacy.getName());
  }

  public static LegacyOS fromCanonical(OperatingSystem core) {
    if (core == null) return null;
    return new LegacyOS(core.getId(), core.getName(), core.getActiveFlag());
  }
}
