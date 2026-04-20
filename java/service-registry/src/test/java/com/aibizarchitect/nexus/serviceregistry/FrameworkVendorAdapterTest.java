package com.aibizarchitect.nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

public class FrameworkVendorAdapterTest {
  @Test
  public void testToCanonicalAndFromCanonical() {
    // Build a legacy vendor instance via reflection to simulate Spring DTO
    try {
      Class<?> legacyCls = Class.forName("nexus.serviceregistry.v1.entity.FrameworkVendor");
      Object legacy = legacyCls.getDeclaredConstructor().newInstance();
      legacyCls.getMethod("setId", Long.class).invoke(legacy, 1L);
      legacyCls.getMethod("setName", String.class).invoke(legacy, "SpringVendor");
      legacyCls.getMethod("setDescription", String.class).invoke(legacy, "desc");
      legacyCls.getMethod("setUrl", String.class).invoke(legacy, "http://example.com");
      legacyCls.getMethod("setActiveFlag", Boolean.class).invoke(legacy, true);

      FrameworkVendor core = FrameworkVendorAdapter.toCanonical(legacy);
      assertNotNull(core);
      assertEquals(1L, core.getId());
      assertEquals("SpringVendor", core.getName());

      Object legacyBack = FrameworkVendorAdapter.fromCanonical(core);
      assertNotNull(legacyBack);
    } catch (Exception e) {
      fail("Reflection-based test failed: " + e.getMessage());
    }
  }
}
