package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.VisualComponent as LegacyVisual;

public class VisualComponentAdapterTest {
  @Test
  public void testRoundTrip() {
    LegacyVisual legacy = new LegacyVisual(8L, "UI Component");
    VisualComponent core = VisualComponentAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(8), core.getId());
    assertEquals("UI Component", core.getName());

    LegacyVisual back = VisualComponentAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
