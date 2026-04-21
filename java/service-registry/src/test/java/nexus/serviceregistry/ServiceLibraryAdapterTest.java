package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.ServiceLibrary as LegacyLibrary;

public class ServiceLibraryAdapterTest {
  @Test
  public void testRoundTrip() {
    LegacyLibrary legacy = new LegacyLibrary(1L, "LibX", "1.0");
    ServiceLibrary core = ServiceLibraryAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(1), core.getId());
    assertEquals("LibX", core.getName());
    assertEquals("1.0", core.getVersion());

    LegacyLibrary back = ServiceLibraryAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
