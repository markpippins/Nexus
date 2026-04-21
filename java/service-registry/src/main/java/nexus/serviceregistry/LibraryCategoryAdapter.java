package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.LibraryCategory as LegacyLibraryCategory;

public class LibraryCategoryAdapter {
  public static LibraryCategory toCanonical(LegacyLibraryCategory legacy) {
    if (legacy == null) return null;
    return new LibraryCategory(legacy.getId(), legacy.getName());
  }

  public static LegacyLibraryCategory fromCanonical(LibraryCategory core) {
    if (core == null) return null;
    LegacyLibraryCategory legacy = new LegacyLibraryCategory(core.getId(), core.getName());
    legacy.setActiveFlag(core.getActiveFlag());
    return legacy;
  }
}
