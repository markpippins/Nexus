package com.aibizarchitect.nexus.adapters.helidon.v1;

import java.util.HashMap;
import java.util.Map;

import com.aibizarchitect.nexus.core.v1.BinaryData;
import com.aibizarchitect.nexus.core.v1.ServiceRequest;

/**
 * Helidon adapter scaffold for bridging canonical core models with Helidon DTOs.
 */
public class BrokerServiceAdapter {
    private static class SimpleBinary implements BinaryData {
        private final String base64;
        SimpleBinary(String base64) { this.base64 = base64; }
        @Override public String toBase64() { return base64; }
    }

    public static ServiceRequest toCanonical(com.helidon.microprofile.broker.api.v1.ServiceRequest legacy) {
        Map<String, BinaryData> coreParams = null;
        if (legacy.getParams() != null) {
            coreParams = new HashMap<>();
            // placeholder mapping; adjust per Helidon DTOs
            for (Map.Entry<String, Object> e : legacy.getParams().entrySet()) {
                coreParams.put(e.getKey(), new SimpleBinary(e.getValue() == null ? null : e.getValue().toString()));
            }
        }
        ServiceRequest core = new ServiceRequest(legacy.getService(), legacy.getOperation(), coreParams, legacy.getRequestId());
        if (legacy.getEncrypt() != null) core.setEncrypt(legacy.getEncrypt());
        return core;
    }

    public static com.helidon.microprofile.broker.api.v1.ServiceRequest fromCanonical(ServiceRequest core) {
        Map<String, Object> legacyParams = new HashMap<>();
        if (core.getParams() != null) {
            for (Map.Entry<String, BinaryData> e : core.getParams().entrySet()) {
                legacyParams.put(e.getKey(), e.getValue() != null ? e.getValue().toBase64() : null);
            }
        }
        com.helidon.microprofile.broker.api.v1.ServiceRequest legacy = new com.helidon.microprofile.broker.api.v1.ServiceRequest(
                core.getService(), core.getOperation(), legacyParams, core.getRequestId());
        if (core.getEncrypt() != null) legacy.setEncrypt(core.getEncrypt());
        return legacy;
    }
}
