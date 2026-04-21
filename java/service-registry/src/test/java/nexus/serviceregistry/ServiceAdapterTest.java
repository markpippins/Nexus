package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.Service as LegacyService;

public class ServiceAdapterTest {
  @Test
  public void testRoundTrip() {
    LegacyService legacy = new LegacyService(5L, "Billing", true);
    Service core = ServiceAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(5), core.getId());
    assertEquals("Billing", core.getName());

    LegacyService back = ServiceAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
