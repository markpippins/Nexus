package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.ServiceLibrary as LegacyLibrary;

public class ServiceLibraryAdapter {
  public static ServiceLibrary toCanonical(LegacyLibrary legacy) {
    if (legacy == null) return null;
    return new ServiceLibrary(legacy.getId(), legacy.getName(), legacy.getVersion());
  }
  public static LegacyLibrary fromCanonical(ServiceLibrary core) {
    if (core == null) return null;
    return new LegacyLibrary(core.getId(), core.getName(), core.getVersion(), null);
  }
}
