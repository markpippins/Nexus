package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.Host as LegacyHost;

public class HostAdapterTest {
  @Test
  public void testRoundTrip() {
    LegacyHost legacy = new LegacyHost();
    legacy.setId(10L);
    legacy.setName("host1");
    legacy.setActiveFlag(true);

    Host core = HostAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(10), core.getId());
    assertEquals("host1", core.getName());

    LegacyHost back = HostAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
