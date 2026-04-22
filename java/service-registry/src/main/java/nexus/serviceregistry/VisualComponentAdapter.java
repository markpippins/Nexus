package nexus.serviceregistry;

public class VisualComponentAdapter {
  public static VisualComponent toCanonical(nexus.serviceregistry.v1.entity.VisualComponent legacy) {
    if (legacy == null) return null;
    return new VisualComponent(legacy.getId(), legacy.getName());
  }
  public static nexus.serviceregistry.v1.entity.VisualComponent fromCanonical(VisualComponent core) {
    if (core == null) return null;
    return new nexus.serviceregistry.v1.entity.VisualComponent(core.getId(), core.getName());
  }
}
