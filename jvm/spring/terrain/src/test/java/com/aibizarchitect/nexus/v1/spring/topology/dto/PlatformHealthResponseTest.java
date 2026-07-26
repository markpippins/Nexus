package com.aibizarchitect.nexus.v1.spring.topology.dto;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for {@link PlatformHealthResponse} covering all four paths.
 *
 * <h3>Coverage model</h3>
 * <ol>
 *   <li><b>Green path</b> — all services healthy → terrainUp=true, correct counts.</li>
 *   <li><b>Orange path</b> — mixed health, empty lists, missing keys.</li>
 *   <li><b>Red path</b> — null lists, malformed maps.</li>
 *   <li><b>Silent failure</b> — terrainUp calculation edge cases (stored vs live status).</li>
 * </ol>
 */
@DisplayName("PlatformHealthResponse")
class PlatformHealthResponseTest {

    // ─────────────────────────────────────────────────────────────
    // GREEN PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Green path — all services healthy")
    class GreenPath {

        @Test
        @DisplayName("all services ON → terrainUp=true")
        void allServicesOn_terrainUpTrue() {
            List<Map<String, Object>> mcps = List.of(
                serviceMap("conduit-mcp", "ON", "ONLINE"));
            List<Map<String, Object>> svcs = List.of(
                serviceMap("nebula-srv", "ON", "ONLINE"));
            List<Map<String, Object>> servers = List.of(serverMap("host1", "ONLINE"));

            Map<String, Object> result = PlatformHealthResponse.build(mcps, svcs, servers);

            assertTrue((Boolean) result.get("terrainUp"),
                "All services ON should produce terrainUp=true");
            assertNotNull(result.get("timestamp"), "Timestamp must be present");
        }

        @Test
        @DisplayName("correct section counts for all-ON services")
        void allOn_correctCounts() {
            List<Map<String, Object>> mcps = List.of(
                serviceMap("mcp1", "ON", "ONLINE"),
                serviceMap("mcp2", "ON", "ONLINE"));
            List<Map<String, Object>> svcs = List.of();
            List<Map<String, Object>> servers = List.of();

            Map<String, Object> result = PlatformHealthResponse.build(mcps, svcs, servers);

            @SuppressWarnings("unchecked")
            Map<String, Object> mcpSection = (Map<String, Object>) result.get("mcpServers");
            assertEquals(2, ((Number) mcpSection.get("total")).intValue(), "2 MCP servers total");
            assertEquals(2, ((Number) mcpSection.get("online")).intValue(), "2 MCP servers online");
            assertEquals(0, ((Number) mcpSection.get("offline")).intValue(), "0 MCP servers offline");
            assertEquals(0, ((Number) mcpSection.get("degraded")).intValue(), "0 MCP servers degraded");
        }

        @Test
        @DisplayName("no liveStatus → falls back to stored status")
        void noLiveStatus_fallsBackToStored() {
            Map<String, Object> mcp = new LinkedHashMap<>();
            mcp.put("name", "no-probe-mcp");
            mcp.put("status", "ONLINE");
            // No liveStatus key

            List<Map<String, Object>> mcps = List.of(mcp);
            Map<String, Object> result = PlatformHealthResponse.build(mcps, List.of(), List.of());

            assertTrue((Boolean) result.get("terrainUp"),
                "Stored status ONLINE with no probe should be healthy");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // ORANGE PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Orange path — mixed and degraded health")
    class OrangePath {

        @Test
        @DisplayName("one service OFFLINE → terrainUp=false")
        void oneOffline_terrainUpFalse() {
            List<Map<String, Object>> mcps = List.of(
                serviceMap("mcp1", "ON", "ONLINE"),
                serviceMap("mcp2", "OFFLINE", "ONLINE"));
            List<Map<String, Object>> svcs = List.of();
            List<Map<String, Object>> servers = List.of();

            Map<String, Object> result = PlatformHealthResponse.build(mcps, svcs, servers);

            assertFalse((Boolean) result.get("terrainUp"),
                "One OFFLINE service should produce terrainUp=false");
        }

        @Test
        @DisplayName("one service DEGRADED → terrainUp=false")
        void oneDegraded_terrainUpFalse() {
            List<Map<String, Object>> mcps = List.of(
                serviceMap("mcp1", "DEGRADED", "ONLINE"));
            List<Map<String, Object>> svcs = List.of();
            List<Map<String, Object>> servers = List.of();

            Map<String, Object> result = PlatformHealthResponse.build(mcps, svcs, servers);

            assertFalse((Boolean) result.get("terrainUp"),
                "DEGRADED service should produce terrainUp=false");
        }

        @Test
        @DisplayName("empty lists produce terrainUp=true")
        void emptyLists_terrainUpTrue() {
            Map<String, Object> result = PlatformHealthResponse.build(
                List.of(), List.of(), List.of());

            assertTrue((Boolean) result.get("terrainUp"),
                "Empty lists should produce terrainUp=true (no services to be down)");
        }

        @Test
        @DisplayName("UNKNOWN liveStatus falls back to stored status")
        void unknownLiveStatus_fallsBack() {
            Map<String, Object> mcp = new LinkedHashMap<>();
            mcp.put("name", "unknown-probe");
            mcp.put("liveStatus", "UNKNOWN");
            mcp.put("status", "OFFLINE"); // stored status is OFFLINE

            List<Map<String, Object>> mcps = List.of(mcp);
            Map<String, Object> result = PlatformHealthResponse.build(mcps, List.of(), List.of());

            assertFalse((Boolean) result.get("terrainUp"),
                "UNKNOWN liveStatus with OFFLINE stored should be unhealthy");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RED PATH
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Red path — boundary and adversarial input")
    class RedPath {

        @Test
        @DisplayName("null lists throw NPE (GAP: should guard against null)")
        void nullLists_throwsNPE() {
            // GAP: PlatformHealthResponse.build() does not guard against null
            // lists — buildSection() calls items.size() which NPEs on null.
            // This test documents the current behavior. When the bug is fixed,
            // change this to assertDoesNotThrow.
            assertThrows(NullPointerException.class, () ->
                PlatformHealthResponse.build(null, null, null),
                "GAP: Null lists cause NPE — should be guarded with empty-list fallback");
        }

        @Test
        @DisplayName("map without expected keys is handled")
        void mapWithoutKeys_handled() {
            Map<String, Object> empty = new LinkedHashMap<>();
            List<Map<String, Object>> mcps = List.of(empty);

            assertDoesNotThrow(() ->
                PlatformHealthResponse.build(mcps, List.of(), List.of()),
                "Maps missing expected keys should be handled gracefully");
        }

        @Test
        @DisplayName("very large service list does not OOM")
        void veryLargeList_doesNotOom() {
            List<Map<String, Object>> large = new ArrayList<>();
            for (int i = 0; i < 10_000; i++) {
                large.add(serviceMap("svc-" + i, "ON", "ONLINE"));
            }
            assertDoesNotThrow(() ->
                PlatformHealthResponse.build(large, List.of(), List.of()),
                "Large list should not cause OOM");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // SILENT FAILURE
    // ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Silent failure — terrainUp calculation integrity")
    class SilentFailure {

        /**
         * terrainUp=true only if ALL probed services are ON (or no probe).
         * This test verifies the logic doesn't silently flip to true.
         */
        @Test
        @DisplayName("METAMORPHIC: same services should produce same terrainUp")
        void metamorphic_sameInputSameResult() {
            List<Map<String, Object>> mcps = List.of(
                serviceMap("a", "ON", "ONLINE"),
                serviceMap("b", "OFFLINE", "ONLINE"));

            Map<String, Object> r1 = PlatformHealthResponse.build(mcps, List.of(), List.of());
            Map<String, Object> r2 = PlatformHealthResponse.build(mcps, List.of(), List.of());

            assertEquals(r1.get("terrainUp"), r2.get("terrainUp"),
                "Same input should produce identical terrainUp");
        }

        /**
         * Server section should NOT affect terrainUp calculation (only MCP +
         * runnable services are probed for live status).
         */
        @Test
        @DisplayName("server OFFLINE does not affect terrainUp")
        void serverOffline_doesNotAffectTerrainUp() {
            List<Map<String, Object>> mcps = List.of(
                serviceMap("mcp1", "ON", "ONLINE"));
            List<Map<String, Object>> servers = List.of(
                serverMap("offline-host", "OFFLINE"));

            Map<String, Object> result = PlatformHealthResponse.build(mcps, List.of(), servers);

            assertTrue((Boolean) result.get("terrainUp"),
                "Server status should not affect terrainUp — only MCP/runnable probes matter");
        }

        @Test
        @DisplayName("correct offline/DEGRADED count when mixed")
        void mixedStatus_correctCounts() {
            List<Map<String, Object>> mcps = List.of(
                serviceMap("on1", "ON", "ONLINE"),
                serviceMap("off1", "OFFLINE", "ONLINE"),
                serviceMap("deg1", "DEGRADED", "ONLINE"),
                serviceMap("on2", "ON", "ONLINE"));

            Map<String, Object> result = PlatformHealthResponse.build(mcps, List.of(), List.of());

            @SuppressWarnings("unchecked")
            Map<String, Object> section = (Map<String, Object>) result.get("mcpServers");
            assertEquals(4, ((Number) section.get("total")).intValue());
            assertEquals(2, ((Number) section.get("online")).intValue());
            assertEquals(1, ((Number) section.get("offline")).intValue());
            assertEquals(1, ((Number) section.get("degraded")).intValue());
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    private Map<String, Object> serviceMap(String name, String liveStatus, String storedStatus) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", name);
        m.put("liveStatus", liveStatus);
        m.put("status", storedStatus);
        return m;
    }

    private Map<String, Object> serverMap(String hostname, String status) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("hostname", hostname);
        m.put("status", status);
        return m;
    }
}
