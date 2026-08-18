package com.aibizarchitect.nexus.v1.spring.topology.service;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

/**
 * T25 1.3 — registry (:8085) contributes heartbeat freshness to the
 * terrain-served lookup. Never authoritative for location — if the registry
 * is unreachable the lookup still works on terrain-seeded endpoint facts.
 */
@Component
public class RegistryStatusClient {

    private static final Logger log = LoggerFactory.getLogger(RegistryStatusClient.class);

    private final RestTemplate rest = new RestTemplate();
    private final String baseUrl;

    public RegistryStatusClient(@Value("${service.registry.url:http://localhost:8085}") String baseUrl) {
        this.baseUrl = baseUrl;
    }

    /**
     * serviceName(lowercased) -> healthState + lastHeartbeat. Empty map on registry outage.
     * Registry /api/v1/status is paginated (0-indexed page, per_page=20) — page through
     * every page so freshness merge covers the whole catalog, not just the first page.
     */
    public Map<String, RegistryStatus> fetchStatus() {
        try {
            Map<String, RegistryStatus> byName = new HashMap<>();
            int page = 0;
            while (true) {
                StatusPage pageData = rest.getForObject(
                        baseUrl + "/api/v1/status?page=" + page, StatusPage.class);
                if (pageData == null || pageData.getRows() == null || pageData.getRows().length == 0) {
                    break;
                }
                for (RegistryStatus r : pageData.getRows()) {
                    if (r.getServiceName() != null) {
                        byName.put(r.getServiceName().toLowerCase(), r);
                    }
                }
                Integer lastPage = pageData.getMeta() == null ? null : pageData.getMeta().getLastPage();
                if (lastPage == null || page >= lastPage) {
                    break;
                }
                page++;
            }
            return byName;
        } catch (Exception e) {
            log.warn("registry status unavailable ({}): lookup proceeds on terrain facts", e.getMessage());
            return Collections.emptyMap();
        }
    }

    /** Envelope matching the registry's { data, meta } pagination shape. */
    public static class StatusPage {
        private RegistryStatus[] data;
        private StatusMeta meta;

        public RegistryStatus[] getRows() {
            return data;
        }

        public RegistryStatus[] getData() {
            return data;
        }

        public void setData(RegistryStatus[] data) {
            this.data = data;
        }

        public StatusMeta getMeta() {
            return meta;
        }

        public void setMeta(StatusMeta meta) {
            this.meta = meta;
        }
    }

    public static class StatusMeta {
        private Integer page;
        private Integer perPage;
        private Integer total;
        private Integer lastPage;

        public Integer getPage() {
            return page;
        }

        public void setPage(Integer page) {
            this.page = page;
        }

        public Integer getPerPage() {
            return perPage;
        }

        public void setPerPage(Integer perPage) {
            this.perPage = perPage;
        }

        public Integer getTotal() {
            return total;
        }

        public void setTotal(Integer total) {
            this.total = total;
        }

        public Integer getLastPage() {
            return lastPage;
        }

        public void setLastPage(Integer lastPage) {
            this.lastPage = lastPage;
        }
    }

    public static class RegistryStatus {
        private Long serviceId;
        private String serviceName;
        private String healthState;
        private String lastHeartbeat;

        public RegistryStatus() {
        }

        public Long getServiceId() {
            return serviceId;
        }

        public void setServiceId(Long serviceId) {
            this.serviceId = serviceId;
        }

        public String getServiceName() {
            return serviceName;
        }

        public void setServiceName(String serviceName) {
            this.serviceName = serviceName;
        }

        public String getHealthState() {
            return healthState;
        }

        public void setHealthState(String healthState) {
            this.healthState = healthState;
        }

        public String getLastHeartbeat() {
            return lastHeartbeat;
        }

        public void setLastHeartbeat(String lastHeartbeat) {
            this.lastHeartbeat = lastHeartbeat;
        }
    }
}
