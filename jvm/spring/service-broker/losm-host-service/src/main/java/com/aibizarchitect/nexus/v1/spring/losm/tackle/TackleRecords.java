package com.aibizarchitect.nexus.v1.spring.losm.tackle;

import java.util.List;
import java.util.Map;

/**
 * Rows of the tackle AI-config registry schema (PostgreSQL, schema "tackle").
 * losm-host-service reads/writes THE SAME tables as tackle-srv — single
 * source of truth, two runtimes (Node + JVM).
 */
public final class TackleRecords {
    private TackleRecords() {}

    public record Provider(
            String id, String name, String type,
            String endpointUrl, String apiKey, Map<String, Object> configJson) {}

    public record Harness(String id, String name, Map<String, Object> invocationSemantics) {}

    public record ModelRow(
            String id, String name, String harnessId,
            String providerId, String modelIdentifier, boolean verified) {}

    public record RoleRow(String id, String name, String description) {}

    public record ConfigBundle(
            String id, String name, String role, String modelId, String providerId,
            String harnessId, int priority, String invocationMode, String command,
            String endpointUrl, Integer timeoutMs, Boolean isActive) {}

    /**
     * Mirrors tackle-srv getResolvedRoleConfig(): the winning bundle joined
     * with its provider/model/harness, plus ordered fallbacks.
     */
    public record ResolvedRoleConfig(
            String role, String modelIdentifier, String providerId, String providerName,
            String providerType, String apiKey, String endpointUrl, String harnessName,
            List<ResolvedFallback> fallbacks) {}

    public record ResolvedFallback(int priority, String modelIdentifier,
                                   String providerType, String providerName) {}
}
