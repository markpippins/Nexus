package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.DeploymentHistory as Legacy;
import java.time.LocalDateTime;

public class DeploymentHistoryAdapterTest {
  @Test
  public void testRoundTrip() {
    Legacy legacy = new Legacy(1L, 99L, LocalDateTime.now(), "CREATE");
    DeploymentHistory core = DeploymentHistoryAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(1), core.getId());
    Legacy back = DeploymentHistoryAdapter.fromCanonical(core);
    assertNotNull(back);
  }
}
