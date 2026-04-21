package nexus.serviceregistry;

/** Bridge between the legacy Spring v1 FrameworkVendor (nexus.serviceregistry.v1.entity.FrameworkVendor)
 * and the canonical core FrameworkVendor model (nexus.serviceregistry.FrameworkVendor). */
public class FrameworkVendorAdapter {
  public static FrameworkVendor toCanonical(nexus.serviceregistry.v1.entity.FrameworkVendor legacy) {
    if (legacy == null) return null;
    return new FrameworkVendor(legacy.getId(), legacy.getName(), legacy.getDescription(), legacy.getUrl(), legacy.getActiveFlag());
  }

  public static nexus.serviceregistry.v1.entity.FrameworkVendor fromCanonical(FrameworkVendor core) {
    if (core == null) return null;
    return new nexus.serviceregistry.v1.entity.FrameworkVendor(core.getId(), core.getName(), core.getDescription(), core.getUrl(), core.getActiveFlag());
  }
}
