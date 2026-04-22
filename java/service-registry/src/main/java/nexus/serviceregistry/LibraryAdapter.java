package nexus.serviceregistry;

public class LibraryAdapter {
  public static Library toCanonical(nexus.serviceregistry.v1.entity.Library legacy) {
    if (legacy == null) return null;
    return new Library(legacy.getId(), legacy.getName(), legacy.getVersion(), legacy.getActiveFlag());
  }
  public static nexus.serviceregistry.v1.entity.Library fromCanonical(Library core) {
    if (core == null) return null;
    return new nexus.serviceregistry.v1.entity.Library(core.getId(), core.getName(), core.getVersion(), core.getActiveFlag());
  }
}
