package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.ServerType as LegacyServerType;

public class ServerTypeAdapterTest {
  @Test
  public void testRoundTrip() {
    LegacyServerType legacy = new LegacyServerType(3L, "Docker");
    ServerType core = ServerTypeAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(3), core.getId());
    assertEquals("Docker", core.getName());

    LegacyServerType back = ServerTypeAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
