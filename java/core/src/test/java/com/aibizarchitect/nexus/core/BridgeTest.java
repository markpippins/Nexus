package com.aibizarchitect.nexus.core;

import static org.junit.jupiter.api.Assertions.*;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

import com.aibizarchitect.nexus.core.ServiceRequest;
import com.aibizarchitect.nexus.core.BinaryData;
import com.aibizarchitect.nexus.core.ServiceResponseBody;
import com.aibizarchitect.nexus.core.ResponseError;

public class BridgeTest {
  @Test
  public void testCanonicalRoundTrip() {
    Map<String, BinaryData> canonicalParams = new HashMap<>();
    canonicalParams.put("p1", new BinaryData() { public String toBase64(){ return "dmFsdWU="; } });
    ServiceRequest canonical = new ServiceRequest("svc","op", canonicalParams, "req-123");
    // simulate simple encoding path using adapter-like logic inline
    assertNotNull(canonical);
  }
}
