package nexus.serviceregistry;

public class ServiceLibraryAdapter {
  public static ServiceLibrary toCanonical(nexus.serviceregistry.v1.entity.ServiceLibrary legacy) {
    if (legacy == null) return null;
    return new ServiceLibrary(legacy.getId(), legacy.getName(), legacy.getVersion());
  }
  public static nexus.serviceregistry.v1.entity.ServiceLibrary fromCanonical(ServiceLibrary core) {
    if (core == null) return null;
    return new nexus.serviceregistry.v1.entity.ServiceLibrary(core.getId(), core.getName(), core.getVersion());
  }
}
