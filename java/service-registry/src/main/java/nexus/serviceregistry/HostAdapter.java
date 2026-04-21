package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.Host as LegacyHost;

public class HostAdapter {
  public static Host toCanonical(LegacyHost legacy) {
    if (legacy == null) return null;
    return new Host(legacy.getId(), legacy.getName());
  }

  public static LegacyHost fromCanonical(Host core) {
    if (core == null) return null;
    return new LegacyHost(core.getId(), core.getName(), core.getActiveFlag());
  }
}
