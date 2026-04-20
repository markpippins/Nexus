package com.aibizarchitect.nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

/** Tests for migrating Spring service-registry FrameworkVendor into the java module core. */
public class FrameworkVendorAdapterTest {
  @Test
  public void testToCanonicalAndFromCanonical() {
    // Create a legacy Spring FrameworkVendor (Spring side)
    try {
      Class<?> legacyCls = Class.forName("nexus.serviceregistry.v1.entity.FrameworkVendor");
      Object legacy = legacyCls.getDeclaredConstructor().newInstance();
      // setter methods exist in legacy class
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
      fail("Reflection-based migration failed: " + e.getMessage());
    }
  }
}
