package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.ServiceConfiguration as LegacyConfig;

public class ServiceConfigurationAdapterTest {
  @Test
  public void testRoundTrip() {
    LegacyConfig legacy = new LegacyConfig(1L, "timeout", "30s");
    ServiceConfiguration core = ServiceConfigurationAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(1L, core.getId().longValue());
    assertEquals("timeout", core.getKey());
    assertEquals("30s", core.getValue());

    LegacyConfig back = ServiceConfigurationAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
