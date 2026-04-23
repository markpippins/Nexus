package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.client.ServicesConsoleClient;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.config.TestJpaConfig;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.controller.HostController;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Host;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.HostRepository;

@WebMvcTest(HostController.class)
@Import(TestJpaConfig.class)
class HostControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ServicesConsoleClient client;

    @MockBean
    private HostRepository hostRepository;

    private Host testHost;

    @BeforeEach
    void setUp() {
        testHost = new Host();
        testHost.setId(1L);
        testHost.setHostname("test-server");
        testHost.setIpAddress("192.168.1.100");
        testHost.setActiveFlag(true);
    }

    @Test
    void getServers_ByHostname_Found() throws Exception {
        when(hostRepository.findByHostname("test-server")).thenReturn(Optional.of(testHost));

        mockMvc.perform(get("/api/v1/servers").param("hostname", "test-server"))
                .andExpect(status().isOk());
    }

    @Test
    void getServers_ByHostname_NotFound() throws Exception {
        when(hostRepository.findByHostname("nonexistent")).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/servers").param("hostname", "nonexistent"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getServers_All() throws Exception {
        Page<Host> hostPage = new PageImpl<>(List.of(testHost));
        when(hostRepository.findAll(any(Pageable.class))).thenReturn(hostPage);

        mockMvc.perform(get("/api/v1/servers"))
                .andExpect(status().isOk());
    }

    @Test
    void getServerById_Found() throws Exception {
        when(hostRepository.findById(1L)).thenReturn(Optional.of(testHost));

        mockMvc.perform(get("/api/v1/servers/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.hostname").value("test-server"));
    }

    @Test
    void getServerById_NotFound() throws Exception {
        when(hostRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/servers/1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void createServer_Success() throws Exception {
        when(hostRepository.findByHostname("test-server")).thenReturn(Optional.empty());
        when(hostRepository.save(any(Host.class))).thenReturn(testHost);

        mockMvc.perform(post("/api/v1/servers")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"hostname\":\"test-server\",\"ipAddress\":\"192.168.1.100\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void createServer_DuplicateHostname() throws Exception {
        when(hostRepository.findByHostname("test-server")).thenReturn(Optional.of(testHost));

        mockMvc.perform(post("/api/v1/servers")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"hostname\":\"test-server\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateServer_Success() throws Exception {
        Host existingHost = new Host();
        existingHost.setId(1L);
        existingHost.setHostname("old-hostname");

        when(hostRepository.findById(1L)).thenReturn(Optional.of(existingHost));
        when(hostRepository.findByHostname("new-hostname")).thenReturn(Optional.empty());
        when(hostRepository.save(any(Host.class))).thenReturn(existingHost);

        mockMvc.perform(put("/api/v1/servers/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"hostname\":\"new-hostname\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void updateServer_NotFound() throws Exception {
        when(hostRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/v1/servers/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"hostname\":\"new-hostname\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteServer_Success() throws Exception {
        when(hostRepository.findById(1L)).thenReturn(Optional.of(testHost));
        doNothing().when(hostRepository).deleteById(1L);

        mockMvc.perform(delete("/api/v1/servers/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteServer_NotFound() throws Exception {
        when(hostRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/v1/servers/1"))
                .andExpect(status().isNotFound());
    }
}
