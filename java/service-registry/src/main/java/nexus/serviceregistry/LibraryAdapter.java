package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.Library as LegacyLibrary;

public class LibraryAdapter {
  public static Library toCanonical(LegacyLibrary legacy) {
    if (legacy == null) return null;
    return new Library(legacy.getId(), legacy.getName(), legacy.getVersion(), legacy.getActiveFlag());
  }

  public static LegacyLibrary fromCanonical(Library core) {
    if (core == null) return null;
    LegacyLibrary legacy = new LegacyLibrary(core.getId(), core.getName(), core.getVersion(), core.getActiveFlag());
    return legacy;
  }
}
