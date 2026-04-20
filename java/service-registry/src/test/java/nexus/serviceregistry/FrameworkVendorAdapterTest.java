package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.FrameworkVendor as LegacyVendor;

public class FrameworkVendorAdapterTest {
  @Test
  public void testRoundTrip() {
    LegacyVendor legacy = new LegacyVendor(1L, "SpringVendor", "desc", "http://example.com", true);
    FrameworkVendor core = FrameworkVendorAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(1), core.getId());
    assertEquals("SpringVendor", core.getName());
    LegacyVendor back = FrameworkVendorAdapter.fromCanonical(core);
    assertNotNull(back);
    // basic sanity checks
    assertEquals(legacy.getId(), back.getId());
  }
}
