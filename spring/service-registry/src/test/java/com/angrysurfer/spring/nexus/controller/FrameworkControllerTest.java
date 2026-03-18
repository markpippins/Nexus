package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.client.ServicesConsoleClient;
import com.angrysurfer.spring.nexus.config.TestJpaConfig;
import com.angrysurfer.spring.nexus.entity.Framework;
import com.angrysurfer.spring.nexus.repository.FrameworkRepository;
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

import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(FrameworkController.class)
@Import(TestJpaConfig.class)
class FrameworkControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ServicesConsoleClient client;

    @MockBean
    private FrameworkRepository frameworkRepository;

    private Framework testFramework;

    @BeforeEach
    void setUp() {
        testFramework = new Framework();
        testFramework.setId(1L);
        testFramework.setName("Spring Boot");
        testFramework.setSupportsBrokerPattern(true);
        testFramework.setActiveFlag(true);
    }

    @Test
    void getFrameworks_ByName_Found() throws Exception {
        when(frameworkRepository.findByName("Spring Boot")).thenReturn(Optional.of(testFramework));

        mockMvc.perform(get("/api/v1/frameworks").param("name", "Spring Boot"))
                .andExpect(status().isOk());
    }

    @Test
    void getFrameworks_ByName_NotFound() throws Exception {
        when(frameworkRepository.findByName("Nonexistent")).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/frameworks").param("name", "Nonexistent"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getFrameworks_BrokerCompatible() throws Exception {
        Framework framework1 = new Framework();
        framework1.setId(1L);
        framework1.setName("Spring Boot");
        framework1.setSupportsBrokerPattern(true);

        when(frameworkRepository.findAll()).thenReturn(List.of(framework1));

        mockMvc.perform(get("/api/v1/frameworks").param("brokerCompatible", "true"))
                .andExpect(status().isOk());
    }

    @Test
    void getFrameworks_All() throws Exception {
        Page<Framework> frameworkPage = new PageImpl<>(List.of(testFramework));
        when(frameworkRepository.findAll(any(Pageable.class))).thenReturn(frameworkPage);

        mockMvc.perform(get("/api/v1/frameworks"))
                .andExpect(status().isOk());
    }

    @Test
    void getFrameworkById_Found() throws Exception {
        when(frameworkRepository.findById(1L)).thenReturn(Optional.of(testFramework));

        mockMvc.perform(get("/api/v1/frameworks/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.name").value("Spring Boot"));
    }

    @Test
    void getFrameworkById_NotFound() throws Exception {
        when(frameworkRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/frameworks/1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void createFramework_Success() throws Exception {
        when(frameworkRepository.findByName("Spring Boot")).thenReturn(Optional.empty());
        when(frameworkRepository.save(any(Framework.class))).thenReturn(testFramework);

        mockMvc.perform(post("/api/v1/frameworks")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Spring Boot\",\"supportsBrokerPattern\":true}"))
                .andExpect(status().isCreated());
    }

    @Test
    void createFramework_DuplicateName() throws Exception {
        when(frameworkRepository.findByName("Spring Boot")).thenReturn(Optional.of(testFramework));

        mockMvc.perform(post("/api/v1/frameworks")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Spring Boot\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateFramework_Success() throws Exception {
        Framework existingFramework = new Framework();
        existingFramework.setId(1L);
        existingFramework.setName("Old Framework");

        when(frameworkRepository.findById(1L)).thenReturn(Optional.of(existingFramework));
        when(frameworkRepository.findByName("New Framework")).thenReturn(Optional.empty());
        when(frameworkRepository.save(any(Framework.class))).thenReturn(existingFramework);

        mockMvc.perform(put("/api/v1/frameworks/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New Framework\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void updateFramework_NotFound() throws Exception {
        when(frameworkRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/v1/frameworks/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New Framework\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteFramework_Success() throws Exception {
        when(frameworkRepository.findById(1L)).thenReturn(Optional.of(testFramework));
        doNothing().when(frameworkRepository).deleteById(1L);

        mockMvc.perform(delete("/api/v1/frameworks/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteFramework_NotFound() throws Exception {
        when(frameworkRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/v1/frameworks/1"))
                .andExpect(status().isNotFound());
    }
}
