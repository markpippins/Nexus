package com.aibizarchitect.nexus.v1.spring.topology.controller;

import com.aibizarchitect.nexus.v1.spring.topology.dto.PlatformHealthResponse;
import com.aibizarchitect.nexus.v1.spring.topology.entity.McpServer;
import com.aibizarchitect.nexus.v1.spring.topology.entity.RunnableService;
import com.aibizarchitect.nexus.v1.spring.topology.entity.Server;
import com.aibizarchitect.nexus.v1.spring.topology.repository.McpServerRepository;
import com.aibizarchitect.nexus.v1.spring.topology.repository.RunnableServiceRepository;
import com.aibizarchitect.nexus.v1.spring.topology.repository.ServerRepository;

import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;

/**
 * Aggregated platform-health endpoint.
 * Combines MCP servers, runnable services, and host servers into one response
 * so the frontend System Health dashboard can render with a single API call.
 *
 * Each MCP server and runnable service that has a {@code healthCheckUrl}
 * is probed concurrently (2-second timeout per URL) so the response
 * carries both the stored status and a live-probed status.
 */
@RestController
@RequestMapping("/api/v1/platform")
@CrossOrigin(origins = "*")
public class PlatformHealthController {

    private static final HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(2))
            .executor(Executors.newVirtualThreadPerTaskExecutor())
            .build();

    private static final Duration PROBE_TIMEOUT = Duration.ofSeconds(2);

    private final McpServerRepository mcpServerRepository;
    private final RunnableServiceRepository runnableServiceRepository;
    private final ServerRepository serverRepository;

    public PlatformHealthController(
            McpServerRepository mcpServerRepository,
            RunnableServiceRepository runnableServiceRepository,
            ServerRepository serverRepository) {
        this.mcpServerRepository = mcpServerRepository;
        this.runnableServiceRepository = runnableServiceRepository;
        this.serverRepository = serverRepository;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> getHealth() {
        List<McpServer> mcpServers = mcpServerRepository.findAll(Sort.by("name"));
        List<RunnableService> runnableServices = runnableServiceRepository.findAll(Sort.by("name"));
        List<Server> servers = serverRepository.findAll(Sort.by("hostname"));

        // Probe MCP servers and runnable services concurrently
        List<CompletableFuture<Void>> probes = new ArrayList<>();

        List<Map<String, Object>> mcpMaps = toMcpServerMaps(mcpServers, probes);
        List<Map<String, Object>> svcMaps = toRunnableServiceMaps(runnableServices, probes);
        List<Map<String, Object>> serverMaps = toServerMaps(servers);

        // Wait for all probes to finish (or timeout)
        if (!probes.isEmpty()) {
            try {
                CompletableFuture.allOf(probes.toArray(new CompletableFuture[0]))
                        .get(PROBE_TIMEOUT.toMillis() + 500, java.util.concurrent.TimeUnit.MILLISECONDS);
            } catch (Exception e) {
                // Probes that timed out already marked themselves UNKNOWN in the map
            }
        }

        return ResponseEntity.ok(PlatformHealthResponse.build(mcpMaps, svcMaps, serverMaps));
    }

    // ---- Map builders with live probing ----

    private List<Map<String, Object>> toMcpServerMaps(List<McpServer> items,
                                                       List<CompletableFuture<Void>> probes) {
        List<Map<String, Object>> result = new ArrayList<>(items.size());
        for (McpServer s : items) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", s.getId());
            m.put("name", s.getName());
            m.put("port", s.getPort());
            m.put("workspacePath", s.getWorkspacePath());
            m.put("serviceTypeId", s.getServiceTypeId());
            m.put("healthCheckUrl", s.getHealthCheckUrl());
            m.put("status", s.getStatus());
            m.put("transportType", s.getTransportType());
            m.put("version", s.getVersion());
            m.put("description", s.getDescription());
            m.put("repositoryUrl", s.getRepositoryUrl());
            m.put("activeFlag", s.getActiveFlag());
            m.put("isInternal", s.getIsInternal());
            // Start with UNKNOWN; probe will overwrite if healthCheckUrl is set
            m.put("liveStatus", "UNKNOWN");

            String healthCheckUrl = s.getHealthCheckUrl();
            if (healthCheckUrl != null && !healthCheckUrl.isBlank()) {
                probes.add(probeUrl(healthCheckUrl, m));
            }
            result.add(m);
        }
        return result;
    }

    private List<Map<String, Object>> toRunnableServiceMaps(List<RunnableService> items,
                                                             List<CompletableFuture<Void>> probes) {
        List<Map<String, Object>> result = new ArrayList<>(items.size());
        for (RunnableService s : items) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", s.getId());
            m.put("name", s.getName());
            m.put("port", s.getPort());
            m.put("workspacePath", s.getWorkspacePath());
            m.put("serviceTypeId", s.getServiceTypeId());
            m.put("healthCheckUrl", s.getHealthCheckUrl());
            m.put("status", s.getStatus());
            m.put("version", s.getVersion());
            m.put("description", s.getDescription());
            m.put("repositoryUrl", s.getRepositoryUrl());
            m.put("activeFlag", s.getActiveFlag());
            m.put("isInternal", s.getIsInternal());
            m.put("liveStatus", "UNKNOWN");

            String healthCheckUrl = s.getHealthCheckUrl();
            if (healthCheckUrl != null && !healthCheckUrl.isBlank()) {
                probes.add(probeUrl(healthCheckUrl, m));
            }
            result.add(m);
        }
        return result;
    }

    private List<Map<String, Object>> toServerMaps(List<Server> items) {
        List<Map<String, Object>> result = new ArrayList<>(items.size());
        for (Server s : items) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", s.getId());
            m.put("hostname", s.getHostname());
            m.put("ipAddress", s.getIpAddress());
            m.put("os", s.getOs());
            m.put("status", s.getStatus());
            m.put("activeFlag", s.getActiveFlag());
            result.add(m);
        }
        return result;
    }

    // ---- Live probing ----

    /**
     * Fire off an async GET to the given URL. When the response arrives
     * (or the request times out / fails), update {@code itemMap} with
     * the result under the key {@code "liveStatus"}.
     */
    private CompletableFuture<Void> probeUrl(String url, Map<String, Object> itemMap) {
        // Normalize the URL if needed — some may not have a scheme
        String normalizedUrl = url;
        if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
            normalizedUrl = "http://" + normalizedUrl;
        }

        HttpRequest request;
        try {
            request = HttpRequest.newBuilder()
                    .uri(URI.create(normalizedUrl))
                    .timeout(PROBE_TIMEOUT)
                    .GET()
                    .build();
        } catch (Exception e) {
            itemMap.put("liveStatus", "UNKNOWN");
            return CompletableFuture.completedFuture(null);
        }

        return CompletableFuture
                .supplyAsync(() -> {
                    try {
                        HttpResponse<Void> response = httpClient.send(
                                request, HttpResponse.BodyHandlers.discarding());
                        int code = response.statusCode();
                        if (code >= 200 && code < 400) {
                            return "ON";
                        } else if (code == 503) {
                            return "DEGRADED";
                        } else {
                            return "OFFLINE";
                        }
                    } catch (Exception e) {
                        return "OFFLINE";
                    }
                })
                .thenAccept(liveStatus -> itemMap.put("liveStatus", liveStatus))
                .exceptionally(ex -> {
                    itemMap.put("liveStatus", "OFFLINE");
                    return null;
                });
    }
}
