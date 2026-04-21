package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.Framework;

public class FrameworkAdapterTest {
  @Test
  public void testRoundTrip() {
    Framework legacy = new Framework(1L, "Spring Framework", true);
    Framework core = FrameworkAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(1), core.getId());
    assertEquals("Spring Framework", core.getName());

    nexus.serviceregistry.v1.entity.Framework back = FrameworkAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getName(), back.getName());
  }
}
