package nexus.serviceregistry;

import nexus.serviceregistry.v1.entity.VisualComponent as LegacyVisual;

public class VisualComponentAdapter {
  public static VisualComponent toCanonical(LegacyVisual legacy) {
    if (legacy == null) return null;
    return new VisualComponent(legacy.getId(), legacy.getName());
  }
  public static LegacyVisual fromCanonical(VisualComponent core) {
    if (core == null) return null;
    return new LegacyVisual(core.getId(), core.getName());
  }
}
