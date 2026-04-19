package com.aibizarchitect.nexus.adapters.spring.v1;

import java.util.HashMap;
import java.util.Map;

import com.aibizarchitect.nexus.core.v1.BinaryData;
import com.aibizarchitect.nexus.core.v1.ServiceRequest;

/**
 * Spring adapter for bridging canonical core models with Spring-specific DTOs.
 * This is a skeletal implementation to start the adapters layer.
 */
public class BrokerServiceAdapter {

    // Simple in-file BinaryData wrapper for core; real adapters should provide proper implementations.
    private static class SimpleBinary implements BinaryData {
        private final String base64;
        SimpleBinary(String base64) { this.base64 = base64; }
        @Override public String toBase64() { return base64; }
    }

    public static ServiceRequest toCanonical(com.angrysurfer.spring.nexus.broker.api.v1.ServiceRequest legacy) {
        Map<String, BinaryData> coreParams = null;
        if (legacy.getParams() != null) {
            coreParams = new HashMap<>();
            for (Map.Entry<String, Object> e : legacy.getParams().entrySet()) {
                Object v = e.getValue();
                String base64 = v == null ? null : v.toString();
                coreParams.put(e.getKey(), new SimpleBinary(base64));
            }
        }
        ServiceRequest core = new ServiceRequest(legacy.getService(), legacy.getOperation(), coreParams, legacy.getRequestId());
        if (legacy.isEncrypt() != null) {
            core.setEncrypt(legacy.isEncrypt());
        }
        return core;
    }

    public static com.angrysurfer.spring.nexus.broker.api.v1.ServiceRequest fromCanonical(ServiceRequest core) {
        Map<String, Object> legacyParams = new HashMap<>();
        if (core.getParams() != null) {
            for (Map.Entry<String, BinaryData> e : core.getParams().entrySet()) {
                legacyParams.put(e.getKey(), e.getValue() != null ? e.getValue().toBase64() : null);
            }
        }
        com.angrysurfer.spring.nexus.broker.api.v1.ServiceRequest legacy = new com.angrysurfer.spring.nexus.broker.api.v1.ServiceRequest(
                core.getService(), core.getOperation(), legacyParams, core.getRequestId());
        if (core.getEncrypt() != null) legacy.setEncrypt(core.getEncrypt());
        return legacy;
    }
}
