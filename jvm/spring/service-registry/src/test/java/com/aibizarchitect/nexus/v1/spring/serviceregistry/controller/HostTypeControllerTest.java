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

import com.aibizarchitect.nexus.v1.spring.serviceregistry.config.TestJpaConfig;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.controller.HostTypeController;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.HostType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.HostTypeRepository;

@WebMvcTest(HostTypeController.class)
@Import(TestJpaConfig.class)
class HostTypeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private HostTypeRepository repository;

    private HostType testHostType;

    @BeforeEach
    void setUp() {
        testHostType = new HostType();
        testHostType.setId(1L);
        testHostType.setName("Docker Container");
        testHostType.setDescription("Docker containerized host");
    }

    @Test
    void getAll() throws Exception {
        Page<HostType> page = new PageImpl<>(List.of(testHostType));
        when(repository.findAll(any(Pageable.class))).thenReturn(page);

        mockMvc.perform(get("/api/v1/host-types"))
                .andExpect(status().isOk());
    }

    @Test
    void getById_Found() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.of(testHostType));

        mockMvc.perform(get("/api/v1/host-types/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.name").value("Docker Container"));
    }

    @Test
    void getById_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/host-types/1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void create_Success() throws Exception {
        when(repository.save(any(HostType.class))).thenReturn(testHostType);

        mockMvc.perform(post("/api/v1/host-types")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Docker Container\",\"description\":\"Docker containerized host\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void update_Success() throws Exception {
        HostType existing = new HostType();
        existing.setId(1L);
        existing.setName("Old Type");

        HostType details = new HostType();
        details.setName("New Type");

        when(repository.findById(1L)).thenReturn(Optional.of(existing));
        when(repository.save(any(HostType.class))).thenReturn(existing);

        mockMvc.perform(put("/api/v1/host-types/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New Type\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void update_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/v1/host-types/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New Type\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void delete_Success() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.of(testHostType));
        doNothing().when(repository).delete(any(HostType.class));

        mockMvc.perform(delete("/api/v1/host-types/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void delete_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/v1/host-types/1"))
                .andExpect(status().isNotFound());
    }
}
