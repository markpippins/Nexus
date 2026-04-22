package nexus.serviceregistry;

public class FrameworkLanguageAdapter {
  public static FrameworkLanguage toCanonical(nexus.serviceregistry.v1.entity.FrameworkLanguage legacy) {
    if (legacy == null) return null;
    return new FrameworkLanguage(legacy.getId(), legacy.getName(), legacy.getCurrentVersion(), legacy.getLtsVersion());
  }

  public static nexus.serviceregistry.v1.entity.FrameworkLanguage fromCanonical(FrameworkLanguage core) {
    if (core == null) return null;
    return new nexus.serviceregistry.v1.entity.FrameworkLanguage(core.getId(), core.getName(), core.getCurrentVersion(), core.getLtsVersion());
  }
}
