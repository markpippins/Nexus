package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.ServiceBackend as LegacyBackend;

public class ServiceBackendAdapterTest {
  @Test
  public void testRoundTrip() {
    LegacyBackend legacy = new LegacyBackend(1L, "BackendA", true);
    ServiceBackend core = ServiceBackendAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(1L, core.getId().longValue());
    assertEquals("BackendA", core.getName());

    LegacyBackend back = ServiceBackendAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
