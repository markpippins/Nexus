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
import com.aibizarchitect.nexus.v1.spring.serviceregistry.controller.OperatingSystemController;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.OperatingSystem;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.OperatingSystemRepository;

@WebMvcTest(OperatingSystemController.class)
@Import(TestJpaConfig.class)
class OperatingSystemControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private OperatingSystemRepository repository;

    private OperatingSystem testOS;

    @BeforeEach
    void setUp() {
        testOS = new OperatingSystem();
        testOS.setId(1L);
        testOS.setName("Ubuntu");
        testOS.setVersion("22.04");
        testOS.setLtsFlag(true);
        testOS.setActiveFlag(true);
    }

    @Test
    void getAll() throws Exception {
        Page<OperatingSystem> page = new PageImpl<>(List.of(testOS));
        when(repository.findAll(any(Pageable.class))).thenReturn(page);

        mockMvc.perform(get("/api/v1/operating-systems"))
                .andExpect(status().isOk());
    }

    @Test
    void getById_Found() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.of(testOS));

        mockMvc.perform(get("/api/v1/operating-systems/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.name").value("Ubuntu"));
    }

    @Test
    void getById_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/operating-systems/1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void create_Success() throws Exception {
        when(repository.save(any(OperatingSystem.class))).thenReturn(testOS);

        mockMvc.perform(post("/api/v1/operating-systems")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Ubuntu\",\"version\":\"22.04\",\"ltsFlag\":true}"))
                .andExpect(status().isCreated());
    }

    @Test
    void update_Success() throws Exception {
        OperatingSystem existing = new OperatingSystem();
        existing.setId(1L);
        existing.setName("Old OS");

        when(repository.findById(1L)).thenReturn(Optional.of(existing));
        when(repository.save(any(OperatingSystem.class))).thenReturn(existing);

        mockMvc.perform(put("/api/v1/operating-systems/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New OS\",\"version\":\"22.04\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void update_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/v1/operating-systems/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New OS\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void delete_Success() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.of(testOS));
        doNothing().when(repository).delete(any(OperatingSystem.class));

        mockMvc.perform(delete("/api/v1/operating-systems/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void delete_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/v1/operating-systems/1"))
                .andExpect(status().isNotFound());
    }
}
