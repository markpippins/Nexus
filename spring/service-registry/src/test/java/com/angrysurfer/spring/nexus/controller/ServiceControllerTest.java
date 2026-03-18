package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.client.ServicesConsoleClient;
import com.angrysurfer.spring.nexus.config.TestJpaConfig;
import com.angrysurfer.spring.nexus.entity.Framework;
import com.angrysurfer.spring.nexus.entity.Service;
import com.angrysurfer.spring.nexus.repository.ServiceRepository;
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

@WebMvcTest(ServiceController.class)
@Import(TestJpaConfig.class)
class ServiceControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ServicesConsoleClient client;

    @MockBean
    private ServiceRepository serviceRepository;

    private Service testService;
    private Framework testFramework;

    @BeforeEach
    void setUp() {
        testFramework = new Framework();
        testFramework.setId(1L);
        testFramework.setName("Spring Boot");

        testService = new Service();
        testService.setId(1L);
        testService.setName("Test Service");
        testService.setDescription("Test Description");
        testService.setFramework(testFramework);
        testService.setActiveFlag(true);
    }

    @Test
    void getServices_ByName_Found() throws Exception {
        when(serviceRepository.findByName("Test Service")).thenReturn(Optional.of(testService));

        mockMvc.perform(get("/api/v1/services").param("name", "Test Service"))
                .andExpect(status().isOk());
    }

    @Test
    void getServices_ByName_NotFound() throws Exception {
        when(serviceRepository.findByName("Nonexistent")).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/services").param("name", "Nonexistent"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getServices_ByFrameworkId() throws Exception {
        Page<Service> servicePage = new PageImpl<>(List.of(testService));
        when(serviceRepository.findByFramework_Id(eq(1L), any())).thenReturn(servicePage);

        mockMvc.perform(get("/api/v1/services").param("frameworkId", "1"))
                .andExpect(status().isOk());
    }

    @Test
    void getServices_Standalone() throws Exception {
        Page<Service> servicePage = new PageImpl<>(List.of(testService));
        when(serviceRepository.findByParentServiceIsNull(any())).thenReturn(servicePage);

        mockMvc.perform(get("/api/v1/services").param("standalone", "true"))
                .andExpect(status().isOk());
    }

    @Test
    void getServices_All() throws Exception {
        Page<Service> servicePage = new PageImpl<>(List.of(testService));
        when(serviceRepository.findAll(any(Pageable.class))).thenReturn(servicePage);

        mockMvc.perform(get("/api/v1/services"))
                .andExpect(status().isOk());
    }

    @Test
    void getServiceById_Found() throws Exception {
        when(serviceRepository.findById(1L)).thenReturn(Optional.of(testService));

        mockMvc.perform(get("/api/v1/services/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.name").value("Test Service"));
    }

    @Test
    void getServiceById_NotFound() throws Exception {
        when(serviceRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/services/1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getServiceDependencies() throws Exception {
        mockMvc.perform(get("/api/v1/services/1/dependencies"))
                .andExpect(status().isOk());
    }

    @Test
    void getServiceDependents() throws Exception {
        mockMvc.perform(get("/api/v1/services/1/dependents"))
                .andExpect(status().isOk());
    }

    @Test
    void getSubModules() throws Exception {
        when(serviceRepository.findByParentService_Id(1L)).thenReturn(List.of(testService));

        mockMvc.perform(get("/api/v1/services/1/sub-modules"))
                .andExpect(status().isOk());
    }

    @Test
    void createService_Success() throws Exception {
        when(serviceRepository.findByName("Test Service")).thenReturn(Optional.empty());
        when(serviceRepository.save(any(Service.class))).thenReturn(testService);

        mockMvc.perform(post("/api/v1/services")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Test Service\",\"description\":\"Test Description\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void createService_DuplicateName() throws Exception {
        when(serviceRepository.findByName("Test Service")).thenReturn(Optional.of(testService));

        mockMvc.perform(post("/api/v1/services")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Test Service\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateService_Success() throws Exception {
        Service existingService = new Service();
        existingService.setId(1L);
        existingService.setName("Old Name");

        when(serviceRepository.findById(1L)).thenReturn(Optional.of(existingService));
        when(serviceRepository.findByName("New Name")).thenReturn(Optional.empty());
        when(serviceRepository.save(any(Service.class))).thenReturn(existingService);

        mockMvc.perform(put("/api/v1/services/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New Name\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void updateService_NotFound() throws Exception {
        when(serviceRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/v1/services/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New Name\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void updateService_DuplicateName() throws Exception {
        Service existingService = new Service();
        existingService.setId(1L);
        existingService.setName("Old Name");

        when(serviceRepository.findById(1L)).thenReturn(Optional.of(existingService));
        when(serviceRepository.findByName("Existing Name")).thenReturn(Optional.of(new Service()));

        mockMvc.perform(put("/api/v1/services/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Existing Name\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void deleteService_Success() throws Exception {
        when(serviceRepository.findById(1L)).thenReturn(Optional.of(testService));
        doNothing().when(serviceRepository).deleteById(1L);

        mockMvc.perform(delete("/api/v1/services/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteService_NotFound() throws Exception {
        when(serviceRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/v1/services/1"))
                .andExpect(status().isNotFound());
    }
}
