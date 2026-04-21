package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.Library as LegacyLibrary;

public class LibraryAdapterTest {
  @Test
  public void testRoundTrip() {
    LegacyLibrary legacy = new LegacyLibrary(1L, "LibA", "1.0", true);
    Library core = new Library(legacy.getId(), legacy.getName(), legacy.getVersion(), legacy.getActiveFlag());
    assertNotNull(core);
    assertEquals(1L, core.getId().longValue());
  }
}
