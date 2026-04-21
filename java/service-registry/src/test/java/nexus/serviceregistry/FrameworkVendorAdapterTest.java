package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

public class FrameworkVendorAdapterTest {
  @Test
  public void testRoundTrip() {
    nexus.serviceregistry.v1.entity.FrameworkVendor legacy =
      new nexus.serviceregistry.v1.entity.FrameworkVendor(1L, "SpringVendor", "desc", "http://example.com", true);

    // toCanonical bridge
    nexus.serviceregistry.FrameworkVendor core = FrameworkVendorAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(1), core.getId());
    assertEquals("SpringVendor", core.getName());

    // fromCanonical bridge
    nexus.serviceregistry.v1.entity.FrameworkVendor back = FrameworkVendorAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
