package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.Deployment;

public class DeploymentAdapterTest {
  @Test
  public void testRoundTripToCanonical() {
    Deployment legacy = new Deployment();
    legacy.setId(100L);
    Deployment core = DeploymentAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(100), core.getId());
  }
}
