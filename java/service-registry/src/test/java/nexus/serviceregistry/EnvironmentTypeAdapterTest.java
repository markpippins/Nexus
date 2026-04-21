package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

import nexus.serviceregistry.v1.entity.EnvironmentType as LegacyEnvironmentType;

public class EnvironmentTypeAdapterTest {
  @Test
  public void testToCanonicalAndFromCanonical() {
    // legacy v1 EnvironmentType
    LegacyEnvironmentType legacy = new LegacyEnvironmentType();
    legacy.setId(2L);
    legacy.setName("Staging");
    legacy.setActiveFlag(true);

    // to canonical
    EnvironmentType core = EnvironmentTypeAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(2), core.getId());
    assertEquals("Staging", core.getName());

    // from canonical back to legacy
    LegacyEnvironmentType back = EnvironmentTypeAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
