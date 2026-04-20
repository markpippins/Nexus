package com.aibizarchitect.nexus.adapters.spring.v1;

import java.util.HashMap;
import java.util.Map;

// Simple runtime bridge test to validate canonical <-> legacy mappings for Spring glue
public class BridgeTestRunner {
  public static void main(String[] args) {
    // Prepare a legacy Spring ServiceRequest
    Map<String, Object> legacyParams = new HashMap<>();
    legacyParams.put("foo", "bar");
    com.angrysurfer.spring.nexus.broker.api.v1.ServiceRequest legacyReq =
        new com.angrysurfer.spring.nexus.broker.api.v1.ServiceRequest("testService", "doThing", legacyParams, "req-1");
    legacyReq.setEncrypt(false);

    // toCanonical
    com.aibizarchitect.nexus.core.ServiceRequest canon = BrokerServiceAdapter.toCanonical(legacyReq);
    System.out.println("Canonical service: " + canon.getService());
    System.out.println("Canonical operation: " + canon.getOperation());
    // fromCanonical back
    com.angrysurfer.spring.nexus.broker.api.v1.ServiceRequest back = BrokerServiceAdapter.fromCanonical(canon);
    System.out.println("Back service: " + back.getService());

    // Canonical response example
    com.aibizarchitect.nexus.core.ServiceResponseBody coreResp = new com.aibizarchitect.nexus.core.ServiceResponseBody(true, "req-1", "2026-01-01T00:00:00Z");
    coreResp.setData(new com.aibizarchitect.nexus.core.BinaryData() {
      @Override public String toBase64() { return "dGVzdA=="; }
    });
    com.angrysurfer.spring.nexus.broker.api.v1.ServiceResponseBody legacyResp = BrokerServiceAdapter.fromCanonical(coreResp);
    System.out.println("Legacy resp ok: " + legacyResp.isOk());
  }
}
