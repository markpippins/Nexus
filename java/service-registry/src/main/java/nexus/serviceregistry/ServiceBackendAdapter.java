package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.ServiceBackend as LegacyBackend;

public class ServiceBackendAdapter {
  public static ServiceBackend toCanonical(LegacyBackend legacy) {
    if (legacy == null) return null;
    return new ServiceBackend(legacy.getId(), legacy.getName());
  }
  public static LegacyBackend fromCanonical(ServiceBackend core) {
    if (core == null) return null;
    return new LegacyBackend(core.getId(), core.getName(), null);
  }
}
