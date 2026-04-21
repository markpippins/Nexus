package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.VisualComponent as LegacyVisual;
import nexus.serviceregistry.VisualComponent;

public class VisualComponentDomainTest {
  @Test
  public void testRoundTrip() {
    LegacyVisual legacy = new LegacyVisual(9L, "Chart");
    VisualComponent core = VisualComponentAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(9L, core.getId().longValue());
    assertEquals("Chart", core.getName());
    LegacyVisual back = VisualComponentAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
