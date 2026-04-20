package com.aibizarchitect.nexus.adapters.spring.v1;

import java.util.HashMap;
import java.util.Map;

import com.aibizarchitect.nexus.core.BinaryData;

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
    public static com.aibizarchitect.nexus.core.ServiceRequest toCanonical(com.angrysurfer.spring.nexus.broker.api.v1.ServiceRequest legacy) {
        java.util.Map<String, BinaryData> coreParams = null;
        if (legacy.getParams() != null) {
            coreParams = new java.util.HashMap<>();
            for (Map.Entry<String, Object> e : legacy.getParams().entrySet()) {
                Object v = e.getValue();
                String base64 = v == null ? null : v.toString();
                coreParams.put(e.getKey(), new SimpleBinary(base64));
            }
        }
        com.aibizarchitect.nexus.core.ServiceRequest core = new com.aibizarchitect.nexus.core.ServiceRequest(legacy.getService(), legacy.getOperation(), coreParams, legacy.getRequestId());
        if (legacy.isEncrypt() != null) {
            core.setEncrypt(legacy.isEncrypt());
        }
        return core;
    }
    
    public static com.angrysurfer.spring.nexus.broker.api.v1.ServiceRequest fromCanonical(com.aibizarchitect.nexus.core.ServiceRequest core) {
        java.util.Map<String, Object> legacyParams = new java.util.HashMap<>();
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

    // Bridge for responses: canonical -> legacy
    public static com.angrysurfer.spring.nexus.broker.api.v1.ServiceResponseBody fromCanonical(com.aibizarchitect.nexus.core.ServiceResponseBody core) {
        // map basic fields
        com.angrysurfer.spring.nexus.broker.api.v1.ServiceResponseBody legacy = new com.angrysurfer.spring.nexus.broker.api.v1.ServiceResponseBody(core.isOk(), core.getRequestId(), core.getTs() != null ? java.time.Instant.parse(core.getTs()) : null);
        legacy.setVersion(core.getVersion());
        legacy.setService(core.getService());
        legacy.setOperation(core.getOperation());
        legacy.setEncrypt(core.getEncrypt());
        // map data (BinaryData -> base64 string)
        legacy.setData(core.getData() != null ? core.getData().toBase64() : null);
        // map errors
        if (core.getErrors() != null) {
            java.util.List<com.aibizarchitect.nexus.core.ResponseError> coreErrors = core.getErrors();
            java.util.List<com.angrysurfer.spring.nexus.broker.api.v1.ResponseError> legacyErrors = new java.util.ArrayList<>();
            for (com.aibizarchitect.nexus.core.ResponseError re : coreErrors) {
                legacyErrors.add(new com.angrysurfer.spring.nexus.broker.api.v1.ResponseError(re.getField(), re.getMessage()));
            }
            legacy.setErrors(legacyErrors);
        }
        return legacy;
    }

    // Bridge for responses: legacy -> canonical
    public static com.aibizarchitect.nexus.core.ServiceResponseBody toCanonical(com.angrysurfer.spring.nexus.broker.api.v1.ServiceResponseBody legacy) {
        java.time.Instant ts = legacy.getTs() != null ? legacy.getTs() : null; // legacy stores Instant
        String tsStr = ts != null ? ts.toString() : null;
        com.aibizarchitect.nexus.core.ServiceResponseBody core = new com.aibizarchitect.nexus.core.ServiceResponseBody(legacy.isOk(), legacy.getRequestId(), tsStr);
        core.setVersion(legacy.getVersion());
        core.setService(legacy.getService());
        core.setOperation(legacy.getOperation());
        core.setEncrypt(legacy.isEncrypt());
        core.setData(legacy.getData() != null ? new com.aibizarchitect.nexus.core.BinaryData() {
            @Override public String toBase64() { return legacy.getData().toString(); }
        } : null);
        // map errors
        if (legacy.getErrors() != null) {
            java.util.List<com.aibizarchitect.nexus.core.ResponseError> coreErrors = new java.util.ArrayList<>();
            for (com.angrysurfer.spring.nexus.broker.api.v1.ResponseError re : legacy.getErrors()) {
                coreErrors.add(new com.aibizarchitect.nexus.core.ResponseError(re.getField(), re.getMessage()));
            }
            core.setErrors(coreErrors);
        }
        return core;
    }
}
