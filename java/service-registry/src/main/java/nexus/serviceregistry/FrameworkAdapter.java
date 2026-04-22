package nexus.serviceregistry;

public class FrameworkAdapter {
  public static nexus.serviceregistry.Framework toCanonical(nexus.serviceregistry.v1.entity.Framework legacy) {
    if (legacy == null) return null;
    return new nexus.serviceregistry.Framework(legacy.getId(), legacy.getName(), legacy.getActiveFlag());
  }
  public static nexus.serviceregistry.v1.entity.Framework fromCanonical(nexus.serviceregistry.Framework core) {
    if (core == null) return null;
    return new nexus.serviceregistry.v1.entity.Framework(core.getId(), core.getName(), core.getActiveFlag());
  }
}
