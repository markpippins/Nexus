package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.EnvironmentType; // legacy type

public class EnvironmentTypeAdapterTest {
  @Test
  public void testToCanonicalAndFromCanonical() {
    // legacy v1 EnvironmentType (explicit type)
    EnvironmentType legacy = new EnvironmentType();
    legacy.setId(2L);
    legacy.setName("Staging");
    legacy.setActiveFlag(true);

    // to canonical
    nexus.serviceregistry.EnvironmentType core = EnvironmentTypeAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(2), core.getId());
    assertEquals("Staging", core.getName());

    // from canonical back to legacy
    EnvironmentType back = EnvironmentTypeAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
