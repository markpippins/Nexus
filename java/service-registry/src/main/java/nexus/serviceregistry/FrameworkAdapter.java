package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.Framework as LegacyFramework;

public class FrameworkAdapter {
  public static Framework toCanonical(LegacyFramework legacy) {
    if (legacy == null) return null;
    return new Framework(legacy.getId(), legacy.getName(), legacy.getActiveFlag());
  }

  public static LegacyFramework fromCanonical(Framework core) {
    if (core == null) return null;
    return new LegacyFramework(core.getId(), core.getName(), null, null, core.getActiveFlag());
  }
}
