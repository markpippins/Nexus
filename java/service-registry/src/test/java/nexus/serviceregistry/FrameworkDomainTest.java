package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.Framework as LegacyFramework;

public class FrameworkDomainTest {
  @Test
  public void testRoundTrip() {
    LegacyFramework legacy = new LegacyFramework(4L, "SpringCore", true);
    Framework core = FrameworkAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(4L, core.getId().longValue());
    assertEquals("SpringCore", core.getName());

    LegacyFramework back = FrameworkAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
