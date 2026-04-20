package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.FrameworkVendor as LegacyVendor;

public class FrameworkVendorAdapter {
  public static FrameworkVendor toCanonical(LegacyVendor legacy) {
    if (legacy == null) return null;
    return new FrameworkVendor(legacy.getId(), legacy.getName(), legacy.getDescription(), legacy.getUrl(), legacy.getActiveFlag());
  }

  public static LegacyVendor fromCanonical(FrameworkVendor core) {
    if (core == null) return null;
    return new LegacyVendor(core.getId(), core.getName(), core.getDescription(), core.getUrl(), core.getActiveFlag());
  }
}
