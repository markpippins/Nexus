package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.ServiceConfiguration as LegacyConfig;

public class ServiceConfigurationAdapter {
  public static ServiceConfiguration toCanonical(LegacyConfig legacy) {
    if (legacy == null) return null;
    return new ServiceConfiguration(legacy.getId(), legacy.getKey(), legacy.getValue());
  }
  public static LegacyConfig fromCanonical(ServiceConfiguration core) {
    if (core == null) return null;
    return new LegacyConfig(core.getId(), core.getKey(), core.getValue());
  }
}
