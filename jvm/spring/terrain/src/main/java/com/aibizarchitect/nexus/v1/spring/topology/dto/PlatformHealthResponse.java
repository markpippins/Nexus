package com.aibizarchitect.nexus.v1.spring.topology.dto;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Aggregated platform health response returned by /api/v1/platform/health.
 * Combines MCP server, runnable service, and host server statuses into a
 * single payload so the frontend only makes one call instead of four.
 *
 * Summary counts are computed from the {@code liveStatus} key when
 * available (services with a probed healthCheckUrl); otherwise they
 * fall back to the stored {@code status} key.
 */
public final class PlatformHealthResponse {

    private PlatformHealthResponse() {
    }

    /**
     * Build the aggregated health map from the three entity lists.
     */
    public static Map<String, Object> build(
            List<Map<String, Object>> mcpServers,
            List<Map<String, Object>> runnableServices,
            List<Map<String, Object>> servers) {

        Map<String, Object> health = new LinkedHashMap<>();
        health.put("timestamp", Instant.now().toString());

        health.put("mcpServers", buildSection(mcpServers, "ON", "OFFLINE", "DEGRADED"));
        health.put("runnableServices", buildSection(runnableServices, "ON", "OFFLINE", "DEGRADED"));
        health.put("hostServers", buildServerSection(servers));

        // terrainUp is true ONLY if every ACTIVE probed service is ON or UNKNOWN (no probe),
        // and no ACTIVE probed service is OFFLINE or DEGRADED. Retired services
        // (activeFlag = false) are excluded from platform health.
        boolean terrainUp = allServicesHealthy(mcpServers) && allServicesHealthy(runnableServices);
        health.put("terrainUp", terrainUp);

        return health;
    }

    /**
     * A service is healthy if its liveStatus (when present and meaningful) is ON,
     * or if no probe was attempted (liveStatus UNKNOWN) and stored status is ONLINE.
     * Retired services (activeFlag = false) are skipped.
     */
    private static boolean allServicesHealthy(List<Map<String, Object>> items) {
        return items.stream()
                .filter(PlatformHealthResponse::isActive)
                .allMatch(i -> {
                    Object live = i.get("liveStatus");
                    if (live instanceof String s && !"UNKNOWN".equals(s)) {
                        // Probe ran — service is healthy only if ON
                        return "ON".equals(s);
                    }
                    // No probe — fall back to stored status
                    return "ONLINE".equals(i.get("status"));
                });
    }

    private static boolean isActive(Map<String, Object> item) {
        return !Boolean.FALSE.equals(item.get("activeFlag"));
    }

    private static Map<String, Object> buildSection(List<Map<String, Object>> items,
                                                     String onlineVal,
                                                     String offlineVal,
                                                     String degradedVal) {
        List<Map<String, Object>> active = items.stream()
                .filter(PlatformHealthResponse::isActive)
                .toList();
        Map<String, Object> section = new LinkedHashMap<>();
        section.put("total", active.size());
        section.put("online", countByLiveOrStoredStatus(active, onlineVal));
        section.put("offline", countByLiveOrStoredStatus(active, offlineVal));
        section.put("degraded", countByLiveOrStoredStatus(active, degradedVal));
        section.put("items", items);
        return section;
    }

    private static Map<String, Object> buildServerSection(List<Map<String, Object>> items) {
        Map<String, Object> section = new LinkedHashMap<>();
        section.put("total", items.size());
        section.put("online", countServersByStatus(items, "ONLINE"));
        section.put("offline", countServersByStatus(items, "OFFLINE"));
        section.put("items", items);
        return section;
    }

    /**
     * Count items preferring {@code liveStatus} over {@code status}.
     */
    private static long countByLiveOrStoredStatus(List<Map<String, Object>> items, String target) {
        return items.stream()
                .filter(i -> {
                    Object live = i.get("liveStatus");
                    if (live instanceof String s && !"UNKNOWN".equals(s)) {
                        return target.equals(s);
                    }
                    return target.equals(i.get("status"));
                })
                .count();
    }

    private static long countServersByStatus(List<Map<String, Object>> items, String status) {
        return items.stream()
                .filter(i -> status.equals(i.get("status")))
                .count();
    }
}
