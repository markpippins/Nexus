package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.OperatingSystem as LegacyOS;

public class OperatingSystemAdapterTest {
  @Test
  public void testRoundTrip() {
    LegacyOS legacy = new LegacyOS();
    legacy.setId(20L);
    legacy.setName("Linux");
    legacy.setActiveFlag(true);

    OperatingSystem core = OperatingSystemAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(20), core.getId());
    assertEquals("Linux", core.getName());

    LegacyOS back = OperatingSystemAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
