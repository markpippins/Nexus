package nexus.serviceregistry;

public class EnvironmentTypeAdapter {
  public static nexus.serviceregistry.EnvironmentType toCanonical(nexus.serviceregistry.v1.entity.EnvironmentType legacy) {
    if (legacy == null) return null;
    return new nexus.serviceregistry.EnvironmentType(legacy.getId(), legacy.getName(), legacy.getActiveFlag());
  }

  public static nexus.serviceregistry.v1.entity.EnvironmentType fromCanonical(nexus.serviceregistry.EnvironmentType core) {
    if (core == null) return null;
    return new nexus.serviceregistry.v1.entity.EnvironmentType(core.getId(), core.getName(), core.getActiveFlag());
  }
}
