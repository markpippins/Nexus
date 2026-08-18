package com.aibizarchitect.nexus.v1.spring.topology.controller;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.aibizarchitect.nexus.v1.spring.topology.dto.ServiceEndpointInfo;
import com.aibizarchitect.nexus.v1.spring.topology.dto.ServiceLookupResponse;
import com.aibizarchitect.nexus.v1.spring.topology.service.LookupService;

@ExtendWith(MockitoExtension.class)
class LookupControllerTest {

    @Mock
    private LookupService lookupService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new LookupController(lookupService)).build();
    }

    private ServiceLookupResponse response(String unit) {
        return new ServiceLookupResponse(unit, LookupService.envVar(unit),
                List.of(new ServiceEndpointInfo("primary", "10.0.1.5", "10.0.1.5", 3300, "http", "UP", null)),
                "primary");
    }

    @Test
    void lookupUnit_found_returns200WithContract() throws Exception {
        when(lookupService.lookup("wind-srv")).thenReturn(Optional.of(response("wind-srv")));

        mockMvc.perform(get("/api/v1/lookup/wind-srv"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unit").value("wind-srv"))
                .andExpect(jsonPath("$.envVar").value("WIND_SRV_TARGET"))
                .andExpect(jsonPath("$.preferred").value("primary"))
                .andExpect(jsonPath("$.endpoints[0].instance").value("primary"))
                .andExpect(jsonPath("$.endpoints[0].port").value(3300))
                .andExpect(jsonPath("$.endpoints[0].status").value("UP"));
    }

    @Test
    void lookupUnit_unknown_returns404WithErrorShape() throws Exception {
        when(lookupService.lookup("ghost")).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/lookup/ghost"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.unit").value("ghost"))
                .andExpect(jsonPath("$.error").value("unknown_unit"));
    }

    @Test
    void lookupBatch_returnsDataMetaShape() throws Exception {
        when(lookupService.lookup("wind-srv")).thenReturn(Optional.of(response("wind-srv")));
        when(lookupService.lookup("ghost")).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/lookup").param("units", "wind-srv,ghost"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].unit").value("wind-srv"))
                .andExpect(jsonPath("$.meta.total").value(1));
    }
}
