package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.OperatingSystem as LegacyOS;

public class OperatingSystemDomainTest {
  @Test
  public void testRoundTrip() {
    LegacyOS legacy = new LegacyOS(3L, "Windows", true);
    OperatingSystem core = OperatingSystemAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(3L, core.getId().longValue());
    assertEquals("Windows", core.getName());

    LegacyOS back = OperatingSystemAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
