package com.aibizarchitect.nexus.v1.spring.topology.dto;

import java.util.List;

/**
 * T25 1.3 lookup response — per the ratified contract (R-A-2026-08-15-008):
 * <pre>
 * GET /api/v1/lookup/&lt;unit&gt;
 * 200 { "unit": "wind-srv", "envVar": "WIND_SRV_TARGET",
 *       "endpoints": [ { "instance": "primary", "host": ..., "ip": ..., "port": ...,
 *                        "scheme": "http", "status": "UP", "lastHeartbeat": ... } ],
 *       "preferred": "primary" }
 * 404 { "unit": "wind-srv", "error": "unknown_unit" }
 * </pre>
 */
public class ServiceLookupResponse {

    private String unit;
    private String envVar;
    private List<ServiceEndpointInfo> endpoints;
    private String preferred;

    public ServiceLookupResponse() {
    }

    public ServiceLookupResponse(String unit, String envVar, List<ServiceEndpointInfo> endpoints, String preferred) {
        this.unit = unit;
        this.envVar = envVar;
        this.endpoints = endpoints;
        this.preferred = preferred;
    }

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public String getEnvVar() {
        return envVar;
    }

    public void setEnvVar(String envVar) {
        this.envVar = envVar;
    }

    public List<ServiceEndpointInfo> getEndpoints() {
        return endpoints;
    }

    public void setEndpoints(List<ServiceEndpointInfo> endpoints) {
        this.endpoints = endpoints;
    }

    public String getPreferred() {
        return preferred;
    }

    public void setPreferred(String preferred) {
        this.preferred = preferred;
    }
}
