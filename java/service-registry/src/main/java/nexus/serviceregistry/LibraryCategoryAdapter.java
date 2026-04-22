package nexus.serviceregistry;

public class LibraryCategoryAdapter {
  public static LibraryCategory toCanonical(nexus.serviceregistry.v1.entity.LibraryCategory legacy) {
    if (legacy == null) return null;
    return new LibraryCategory(legacy.getId(), legacy.getName());
  }
  public static nexus.serviceregistry.v1.entity.LibraryCategory fromCanonical(LibraryCategory core) {
    if (core == null) return null;
    return new nexus.serviceregistry.v1.entity.LibraryCategory(core.getId(), core.getName()) { public Boolean getActiveFlag(){ return core.getActiveFlag(); } };
  }
}
