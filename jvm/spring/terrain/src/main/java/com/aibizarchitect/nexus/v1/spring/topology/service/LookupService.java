package com.aibizarchitect.nexus.v1.spring.topology.service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.spring.topology.dto.ServiceEndpointInfo;
import com.aibizarchitect.nexus.v1.spring.topology.dto.ServiceLookupResponse;
import com.aibizarchitect.nexus.v1.spring.topology.entity.ServiceEndpoint;
import com.aibizarchitect.nexus.v1.spring.topology.repository.ServiceEndpointRepository;

/**
 * T25 1.3 (R-A-2026-08-15-008) — instance lookup keyed on unit name.
 *
 * Resolution precedence (client side): lookup(unit) ?? $&lt;UNIT&gt;_TARGET ?? localhost-default.
 * Terrain is the runtime/provisioning truth; registry heartbeat freshness is
 * merged in when present (never blocking). Credential-free by construction.
 */
@Service
public class LookupService {

    private final ServiceEndpointRepository repository;
    private final RegistryStatusClient registryStatusClient;

    public LookupService(ServiceEndpointRepository repository, RegistryStatusClient registryStatusClient) {
        this.repository = repository;
        this.registryStatusClient = registryStatusClient;
    }

    public Optional<ServiceLookupResponse> lookup(String unit) {
        if (unit == null || unit.isBlank()) {
            return Optional.empty();
        }
        List<ServiceEndpoint> endpoints = repository.findByUnitOrderByInstanceAsc(unit);
        if (endpoints.isEmpty()) {
            return Optional.empty();
        }

        Map<String, RegistryStatusClient.RegistryStatus> freshness = registryStatusClient.fetchStatus();

        List<ServiceEndpointInfo> infos = endpoints.stream()
                .map(e -> toInfo(e, freshness.get(e.getUnit().toLowerCase())))
                .toList();

        String preferred = infos.stream()
                .filter(i -> "UP".equalsIgnoreCase(i.getStatus()))
                .map(ServiceEndpointInfo::getInstance)
                .findFirst()
                .orElse("primary");

        return Optional.of(new ServiceLookupResponse(unit, envVar(unit), infos, preferred));
    }

    /** <UNIT>_TARGET env-var name per R-A-2026-08-15-006/007 convention. */
    public static String envVar(String unit) {
        return unit.toUpperCase().replace('-', '_') + "_TARGET";
    }

    private ServiceEndpointInfo toInfo(ServiceEndpoint e, RegistryStatusClient.RegistryStatus reg) {
        String status = e.getStatus() == null ? "UNKNOWN" : e.getStatus();
        OffsetDateTime heartbeat = e.getLastHeartbeat();
        if (reg != null) {
            // Registry healthState: HEALTHY -> UP, UNHEALTHY/OFFLINE -> DOWN.
            // Only override when registry has a definite state.
            if ("HEALTHY".equalsIgnoreCase(reg.getHealthState())) {
                status = "UP";
            } else if ("UNHEALTHY".equalsIgnoreCase(reg.getHealthState())
                    || "OFFLINE".equalsIgnoreCase(reg.getHealthState())) {
                status = "DOWN";
            }
            if (reg.getLastHeartbeat() != null) {
                try {
                    heartbeat = OffsetDateTime.parse(reg.getLastHeartbeat());
                } catch (Exception ex) {
                    // keep existing heartbeat on parse failure
                }
            }
        }
        return new ServiceEndpointInfo(e.getInstance(), e.getHost(), e.getIp(), e.getPort(), e.getScheme(),
                status, heartbeat);
    }
}
