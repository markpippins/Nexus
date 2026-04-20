package com.aibizarchitect.nexus.adapters.helidon;

import java.util.HashMap;
import java.util.Map;

import com.aibizarchitect.nexus.core.BinaryData;
import com.aibizarchitect.nexus.core.ServiceRequest;

/** Helidon adapter bridge (no version suffix). */
public class BrokerServiceAdapter {
    private static class SimpleBinary implements BinaryData {
        private final String base64;
        SimpleBinary(String base64) { this.base64 = base64; }
        @Override public String toBase64() { return base64; }
    }

    public static ServiceRequest toCanonical(io.helidon.microprofile.broker.api.v1.ServiceRequest legacy) {
        Map<String, BinaryData> coreParams = null;
        if (legacy.getParams() != null) {
            coreParams = new HashMap<>();
            for (Map.Entry<String, Object> e : legacy.getParams().entrySet()) {
                Object v = e.getValue();
                String base64 = v == null ? null : v.toString();
                coreParams.put(e.getKey(), new SimpleBinary(base64));
            }
        }
        return new ServiceRequest(legacy.getService(), legacy.getOperation(), coreParams, legacy.getRequestId());
    }

    public static io.helidon.microprofile.broker.api.v1.ServiceRequest fromCanonical(ServiceRequest core) {
        Map<String, Object> legacyParams = new HashMap<>();
        if (core.getParams() != null) {
            for (Map.Entry<String, BinaryData> e : core.getParams().entrySet()) {
                legacyParams.put(e.getKey(), e.getValue() != null ? e.getValue().toBase64() : null);
            }
        }
        return new io.helidon.microprofile.broker.api.v1.ServiceRequest(core.getService(), core.getOperation(), legacyParams, core.getRequestId());
    }
}
