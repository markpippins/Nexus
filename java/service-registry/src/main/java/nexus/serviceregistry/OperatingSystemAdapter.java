package nexus.serviceregistry;

public class OperatingSystemAdapter {
  public static OperatingSystem toCanonical(nexus.serviceregistry.v1.entity.OperatingSystem legacy) {
    if (legacy == null) return null;
    return new OperatingSystem(legacy.getId(), legacy.getName());
  }
  public static nexus.serviceregistry.v1.entity.OperatingSystem fromCanonical(OperatingSystem core) {
    if (core == null) return null;
    return new nexus.serviceregistry.v1.entity.OperatingSystem(core.getId(), core.getName(), core.getActiveFlag());
  }
}
