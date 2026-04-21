package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

public class ServiceLibraryAdapterTest {
  @Test
  public void testRoundTrip() {
    nexus.serviceregistry.v1.entity.ServiceLibrary legacy = new nexus.serviceregistry.v1.entity.ServiceLibrary(1L, "LibX", "1.0");
    ServiceLibrary core = ServiceLibraryAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(1), core.getId());
    assertEquals("LibX", core.getName());
    assertEquals("1.0", core.getVersion());

    nexus.serviceregistry.v1.entity.ServiceLibrary back = ServiceLibraryAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
