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
import com.aibizarchitect.nexus.v1.spring.serviceregistry.controller.ServerTypeController;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServerType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServerTypeRepository;

@WebMvcTest(ServerTypeController.class)
@Import(TestJpaConfig.class)
class ServerTypeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ServerTypeRepository repository;

    private ServerType testServerType;

    @BeforeEach
    void setUp() {
        testServerType = new ServerType();
        testServerType.setId(1L);
        testServerType.setName("Docker Container");
        testServerType.setDescription("Docker containerized server");
    }

    @Test
    void getAll() throws Exception {
        Page<ServerType> page = new PageImpl<>(List.of(testServerType));
        when(repository.findAll(any(Pageable.class))).thenReturn(page);

        mockMvc.perform(get("/api/v1/server-types"))
                .andExpect(status().isOk());
    }

    @Test
    void getById_Found() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.of(testServerType));

        mockMvc.perform(get("/api/v1/server-types/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.name").value("Docker Container"));
    }

    @Test
    void getById_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/server-types/1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void create_Success() throws Exception {
        when(repository.save(any(ServerType.class))).thenReturn(testServerType);

        mockMvc.perform(post("/api/v1/server-types")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Docker Container\",\"description\":\"Docker containerized server\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void update_Success() throws Exception {
        ServerType existing = new ServerType();
        existing.setId(1L);
        existing.setName("Old Type");

        ServerType details = new ServerType();
        details.setName("New Type");

        when(repository.findById(1L)).thenReturn(Optional.of(existing));
        when(repository.save(any(ServerType.class))).thenReturn(existing);

        mockMvc.perform(put("/api/v1/server-types/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New Type\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void update_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/v1/server-types/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New Type\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void delete_Success() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.of(testServerType));
        doNothing().when(repository).delete(any(ServerType.class));

        mockMvc.perform(delete("/api/v1/server-types/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void delete_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/v1/server-types/1"))
                .andExpect(status().isNotFound());
    }
}
