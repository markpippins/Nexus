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

    public static ServiceRequest toCanonical(Object legacy) {
        // Reflection-based bridge to canonical core to avoid hard Helidon DTO dependency at compile time
        try {
            Class<?> cls = legacy.getClass();
            Object service = cls.getMethod("getService").invoke(legacy);
            Object operation = cls.getMethod("getOperation").invoke(legacy);
            Object params = cls.getMethod("getParams").invoke(legacy);
            Object reqId = cls.getMethod("getRequestId").invoke(legacy);
            Object encrypt = cls.getMethod("getEncrypt").invoke(legacy);
            Map<String, BinaryData> coreParams = null;
            if (params instanceof Map) {
                coreParams = new HashMap<>();
                for (Map.Entry<?, ?> e : ((Map<?, ?>) params).entrySet()) {
                    Object val = e.getValue();
                    String base64 = val == null ? null : val.toString();
                    coreParams.put((String) e.getKey(), new SimpleBinary(base64));
                }
            }
            ServiceRequest core = new ServiceRequest(service != null ? service.toString() : "",
                operation != null ? operation.toString() : "",
                coreParams,
                reqId != null ? reqId.toString() : "");
            if (encrypt != null) {
                core.setEncrypt((Boolean) encrypt);
            }
            return core;
        } catch (Exception e) {
            return new ServiceRequest("", "", null, "");
        }
    }

    public static Object fromCanonical(ServiceRequest core) {
        Map<String, Object> legacyParams = new HashMap<>();
        if (core.getParams() != null) {
            for (Map.Entry<String, BinaryData> e : core.getParams().entrySet()) {
                legacyParams.put(e.getKey(), e.getValue() != null ? e.getValue().toBase64() : null);
            }
        }
        java.util.HashMap<String, Object> legacy = new java.util.HashMap<>();
        legacy.put("service", core.getService());
        legacy.put("operation", core.getOperation());
        legacy.put("requestId", core.getRequestId());
        legacy.put("params", legacyParams);
        legacy.put("encrypt", core.getEncrypt());
        return legacy;
    }
}
