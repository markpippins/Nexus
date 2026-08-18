package com.aibizarchitect.nexus.v1.spring.topology.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.aibizarchitect.nexus.v1.spring.topology.dto.ServiceEndpointInfo;
import com.aibizarchitect.nexus.v1.spring.topology.dto.ServiceLookupResponse;
import com.aibizarchitect.nexus.v1.spring.topology.entity.ServiceEndpoint;
import com.aibizarchitect.nexus.v1.spring.topology.repository.ServiceEndpointRepository;
import com.aibizarchitect.nexus.v1.spring.topology.service.RegistryStatusClient.RegistryStatus;

@ExtendWith(MockitoExtension.class)
class LookupServiceTest {

    @Mock
    private ServiceEndpointRepository repository;

    @Mock
    private RegistryStatusClient registryStatusClient;

    private LookupService lookupService;

    @BeforeEach
    void setUp() {
        lookupService = new LookupService(repository, registryStatusClient);
    }

    private ServiceEndpoint endpoint(String instance, String status) {
        ServiceEndpoint e = new ServiceEndpoint();
        e.setUnit("wind-srv");
        e.setInstance(instance);
        e.setHost("10.0.1.5");
        e.setIp("10.0.1.5");
        e.setPort(3300);
        e.setScheme("http");
        e.setStatus(status);
        return e;
    }

    @Test
    void envVar_convention() {
        assertEquals("WIND_SRV_TARGET", LookupService.envVar("wind-srv"));
        assertEquals("FILE_SYSTEM_SERVER_TARGET", LookupService.envVar("file-system-server"));
    }

    @Test
    void lookup_unknownUnit_returnsEmpty() {
        when(repository.findByUnitOrderByInstanceAsc("ghost")).thenReturn(List.of());
        assertTrue(lookupService.lookup("ghost").isEmpty());
    }

    @Test
    void lookup_found_mapsShapeAndPreferred() {
        ServiceEndpoint primary = endpoint("primary", "UP");
        ServiceEndpoint failover = endpoint("failover", "STANDBY");
        when(repository.findByUnitOrderByInstanceAsc("wind-srv")).thenReturn(List.of(primary, failover));
        when(registryStatusClient.fetchStatus()).thenReturn(Collections.emptyMap());

        Optional<ServiceLookupResponse> opt = lookupService.lookup("wind-srv");
        assertTrue(opt.isPresent());
        ServiceLookupResponse resp = opt.get();
        assertEquals("wind-srv", resp.getUnit());
        assertEquals("WIND_SRV_TARGET", resp.getEnvVar());
        assertEquals("primary", resp.getPreferred());
        assertEquals(2, resp.getEndpoints().size());
        ServiceEndpointInfo first = resp.getEndpoints().get(0);
        assertEquals("primary", first.getInstance());
        assertEquals("10.0.1.5", first.getIp());
        assertEquals(3300, first.getPort());
        assertEquals("UP", first.getStatus());
    }

    @Test
    void lookup_registryHeartbeatOverridesStatus() {
        ServiceEndpoint primary = endpoint("primary", "UNKNOWN");
        when(repository.findByUnitOrderByInstanceAsc("wind-srv")).thenReturn(List.of(primary));
        RegistryStatus st = new RegistryStatus();
        st.setServiceName("wind-srv");
        st.setHealthState("HEALTHY");
        st.setLastHeartbeat("2026-08-16T01:30:00Z");
        when(registryStatusClient.fetchStatus()).thenReturn(Map.of("wind-srv", st));

        ServiceLookupResponse resp = lookupService.lookup("wind-srv").orElseThrow();
        assertEquals("UP", resp.getEndpoints().get(0).getStatus());
        assertEquals(OffsetDateTime.parse("2026-08-16T01:30:00Z"), resp.getEndpoints().get(0).getLastHeartbeat());
    }

    @Test
    void lookup_registryUnhealthyMarksDown() {
        ServiceEndpoint primary = endpoint("primary", "UP");
        when(repository.findByUnitOrderByInstanceAsc("wind-srv")).thenReturn(List.of(primary));
        RegistryStatus st = new RegistryStatus();
        st.setServiceName("wind-srv");
        st.setHealthState("OFFLINE");
        when(registryStatusClient.fetchStatus()).thenReturn(Map.of("wind-srv", st));

        ServiceLookupResponse resp = lookupService.lookup("wind-srv").orElseThrow();
        assertEquals("DOWN", resp.getEndpoints().get(0).getStatus());
    }

    @Test
    void lookup_registryDown_keepsSeededFacts() {
        ServiceEndpoint primary = endpoint("primary", "UP");
        when(repository.findByUnitOrderByInstanceAsc("wind-srv")).thenReturn(List.of(primary));
        when(registryStatusClient.fetchStatus()).thenReturn(Collections.emptyMap());

        ServiceLookupResponse resp = lookupService.lookup("wind-srv").orElseThrow();
        assertEquals("UP", resp.getEndpoints().get(0).getStatus());
        verify(registryStatusClient, times(1)).fetchStatus();
    }
}
