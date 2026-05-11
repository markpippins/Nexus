package com.aibizarchitect.nexus.adapters.helidon;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

public class BrokerServiceAdapterTest {
  @Test
  public void smoke() {
    BrokerServiceAdapter a = new BrokerServiceAdapter();
    assertNotNull(a);
  }
}
