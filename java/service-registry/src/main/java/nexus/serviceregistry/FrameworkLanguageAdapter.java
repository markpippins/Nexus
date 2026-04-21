package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.FrameworkLanguage as LegacyLanguage;

public class FrameworkLanguageAdapter {
  public static FrameworkLanguage toCanonical(LegacyLanguage legacy) {
    if (legacy == null) return null;
    return new FrameworkLanguage(legacy.getId(), legacy.getName(), legacy.getCurrentVersion(), legacy.getLtsVersion());
  }

  public static LegacyLanguage fromCanonical(FrameworkLanguage core) {
    if (core == null) return null;
    return new LegacyLanguage(core.getId(), core.getName(), core.getCurrentVersion(), core.getLtsVersion());
  }
}
