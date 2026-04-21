package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.Library as LegacyLibrary;

public class LibraryDomainTest {
  @Test
  public void testRoundTrip() {
    LegacyLibrary legacy = new LegacyLibrary(2L, "LibY", "2.1");
    Library core = LibraryAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(2L, core.getId().longValue());
    assertEquals("LibY", core.getName());
    assertEquals("2.1", core.getVersion());

    LegacyLibrary back = LibraryAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
