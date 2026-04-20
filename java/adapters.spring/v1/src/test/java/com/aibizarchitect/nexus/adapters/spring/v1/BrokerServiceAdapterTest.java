package com.aibizarchitect.nexus.adapters.spring.v1;

import static org.junit.jupiter.api.Assertions.*;

import java.util.HashMap;
import java.util.Map;
import java.time.Instant;

import org.junit.jupiter.api.Test;

public class BrokerServiceAdapterTest {
  @Test
  public void testServiceRequestBridgeRoundTrip() {
    Map<String, Object> legacyParams = new HashMap<>();
    legacyParams.put("p1", "value1");
    com.angrysurfer.spring.nexus.broker.api.v1.ServiceRequest legacy = new com.angrysurfer.spring.nexus.broker.api.v1.ServiceRequest("svc", "op", legacyParams, "req-1");
    legacy.setEncrypt(false);

    com.aibizarchitect.nexus.core.ServiceRequest canonical = BrokerServiceAdapter.toCanonical(legacy);
    assertEquals("svc", canonical.getService());
    assertEquals("op", canonical.getOperation());
    assertEquals("req-1", canonical.getRequestId());
    assertNotNull(canonical.getParams());
    assertEquals("value1", canonical.getParams().get("p1").toBase64());

    com.angrysurfer.spring.nexus.broker.api.v1.ServiceRequest legacyBack = BrokerServiceAdapter.fromCanonical(canonical);
    assertEquals("svc", legacyBack.getService());
    assertEquals("op", legacyBack.getOperation());
    assertEquals("req-1", legacyBack.getRequestId());
    assertEquals("value1", legacyBack.getParams().get("p1"));
  }

  @Test
  public void testServiceResponseBridgeRoundTrip() {
    com.aibizarchitect.nexus.core.ServiceResponseBody core = new com.aibizarchitect.nexus.core.ServiceResponseBody(true, "req-2", Instant.now().toString());
    core.setData(new com.aibizarchitect.nexus.core.BinaryData() { @Override public String toBase64(){ return "dGVzdA=="; } });
    core.setService("svc"); core.setOperation("op"); core.setEncrypt(false);

    com.angrysurfer.spring.nexus.broker.api.v1.ServiceResponseBody legacy = BrokerServiceAdapter.fromCanonical(core);
    assertTrue(legacy.isOk());
    assertEquals("req-2", legacy.getRequestId());
  }
}
