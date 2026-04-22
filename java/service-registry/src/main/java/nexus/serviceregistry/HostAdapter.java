package nexus.serviceregistry;
import nexus.serviceregistry.Host; // canonical

public class HostAdapter {
  public static Host toCanonical(nexus.serviceregistry.v1.entity.Host legacy) {
    if (legacy == null) return null;
    return new Host(legacy.getId(), legacy.getName());
  }

  public static nexus.serviceregistry.v1.entity.Host fromCanonical(Host core) {
    if (core == null) return null;
    return new nexus.serviceregistry.v1.entity.Host(core.getId(), core.getName(), core.getActiveFlag());
  }
}
