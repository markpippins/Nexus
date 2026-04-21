package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.Deployment as LegacyDeployment;

public class DeploymentAdapterTest {
  @Test
  public void testRoundTripToCanonical() {
    LegacyDeployment legacy = new LegacyDeployment();
    deployment.setId(100L);
    Deployment core = DeploymentAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(100L), core.getId());
  }
}
