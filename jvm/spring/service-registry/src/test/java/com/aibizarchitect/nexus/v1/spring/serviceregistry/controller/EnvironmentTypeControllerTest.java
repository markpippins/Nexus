package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

import com.aibizarchitect.nexus.v1.spring.serviceregistry.config.TestJpaConfig;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.controller.EnvironmentTypeController;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.EnvironmentType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.EnvironmentTypeRepository;

@WebMvcTest(EnvironmentTypeController.class)
@Import(TestJpaConfig.class)
class EnvironmentTypeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private EnvironmentTypeRepository repository;

    private EnvironmentType testEnvironment;

    @BeforeEach
    void setUp() {
        testEnvironment = new EnvironmentType();
        testEnvironment.setId(1L);
        testEnvironment.setName("Development");
        testEnvironment.setActiveFlag(true);
    }

    @Test
    void getAll() throws Exception {
        Page<EnvironmentType> page = new PageImpl<>(List.of(testEnvironment));
        when(repository.findAll(any(Pageable.class))).thenReturn(page);

        mockMvc.perform(get("/api/v1/environments"))
                .andExpect(status().isOk());
    }

    @Test
    void getById_Found() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.of(testEnvironment));

        mockMvc.perform(get("/api/v1/environments/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.name").value("Development"));
    }

    @Test
    void getById_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/environments/1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void create_Success() throws Exception {
        when(repository.save(any(EnvironmentType.class))).thenReturn(testEnvironment);

        mockMvc.perform(post("/api/v1/environments")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Development\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void update_Success() throws Exception {
        EnvironmentType existing = new EnvironmentType();
        existing.setId(1L);
        existing.setName("Old Env");

        EnvironmentType details = new EnvironmentType();
        details.setName("New Env");

        when(repository.findById(1L)).thenReturn(Optional.of(existing));
        when(repository.save(any(EnvironmentType.class))).thenReturn(existing);

        mockMvc.perform(put("/api/v1/environments/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New Env\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void update_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/v1/environments/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New Env\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void delete_Success() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.of(testEnvironment));
        doNothing().when(repository).delete(any(EnvironmentType.class));

        mockMvc.perform(delete("/api/v1/environments/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void delete_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/v1/environments/1"))
                .andExpect(status().isNotFound());
    }

    // ================================================================
    // ORANGE / RED / SILENT FAILURE — deepened coverage
    // ================================================================

    @Test
    void create_MalformedJson_returns400() throws Exception {
        mockMvc.perform(post("/api/v1/environments")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{bad json"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getById_NegativeId_returnsNotFound() throws Exception {
        mockMvc.perform(get("/api/v1/environments/-1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void metamorphic_sameInput_sameOutput() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.of(testEnvironment));

        String r1 = mockMvc.perform(get("/api/v1/environments/1")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String r2 = mockMvc.perform(get("/api/v1/environments/1")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertEquals(r1, r2, "Same environment should produce identical JSON");
    }

    @Test
    void regressionLock_notFound_emptyBody() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        String body = mockMvc.perform(get("/api/v1/environments/1"))
                .andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();

        assertEquals("", body, "404 responses currently empty — regression lock");
    }
}
