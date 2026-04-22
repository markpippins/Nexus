package nexus.serviceregistry;
import nexus.serviceregistry.ServiceBackend; // canonical

public class ServiceBackendAdapter {
  public static ServiceBackend toCanonical(nexus.serviceregistry.v1.entity.ServiceBackend legacy) {
    if (legacy == null) return null;
    return new ServiceBackend(legacy.getId(), legacy.getName());
  }
  public static nexus.serviceregistry.v1.entity.ServiceBackend fromCanonical(nexus.serviceregistry.ServiceBackend core) {
    if (core == null) return null;
    return new nexus.serviceregistry.v1.entity.ServiceBackend(core.getId(), core.getName());
  }
}
