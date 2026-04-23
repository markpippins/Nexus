package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
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
import com.aibizarchitect.nexus.v1.spring.serviceregistry.controller.ServiceLibraryController;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServiceLibrary;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceLibraryRepository;

@WebMvcTest(ServiceLibraryController.class)
@Import(TestJpaConfig.class)
class ServiceLibraryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ServiceLibraryRepository repository;

    private ServiceLibrary testServiceLibrary;

    @BeforeEach
    void setUp() {
        testServiceLibrary = new ServiceLibrary();
        testServiceLibrary.setId(1L);
        testServiceLibrary.setServiceId(1L);
        testServiceLibrary.setLibraryId(1L);
        testServiceLibrary.setIsDirect(true);
        testServiceLibrary.setActiveFlag(true);
    }

    @Test
    void getServiceLibraries_ByServiceId() throws Exception {
        Page<ServiceLibrary> page = new PageImpl<>(List.of(testServiceLibrary));
        when(repository.findByServiceId(eq(1L), any())).thenReturn(page);

        mockMvc.perform(get("/api/v1/service-libraries").param("serviceId", "1"))
                .andExpect(status().isOk());
    }

    @Test
    void getServiceLibraries_ByServiceId_Direct() throws Exception {
        Page<ServiceLibrary> page = new PageImpl<>(List.of(testServiceLibrary));
        when(repository.findByServiceIdAndIsDirect(eq(1L), eq(true), any())).thenReturn(page);

        mockMvc.perform(get("/api/v1/service-libraries").param("serviceId", "1").param("direct", "true"))
                .andExpect(status().isOk());
    }

    @Test
    void getServiceLibraries_ByServiceId_Dev() throws Exception {
        Page<ServiceLibrary> page = new PageImpl<>(List.of(testServiceLibrary));
        when(repository.findByServiceIdAndIsDevDependency(eq(1L), eq(true), any())).thenReturn(page);

        mockMvc.perform(get("/api/v1/service-libraries").param("serviceId", "1").param("dev", "true"))
                .andExpect(status().isOk());
    }

    @Test
    void getServiceLibraries_ByServiceId_Production() throws Exception {
        Page<ServiceLibrary> page = new PageImpl<>(List.of(testServiceLibrary));
        when(repository.findByServiceIdAndIsDevDependency(eq(1L), eq(false), any())).thenReturn(page);

        mockMvc.perform(get("/api/v1/service-libraries").param("serviceId", "1").param("production", "true"))
                .andExpect(status().isOk());
    }

    @Test
    void getServiceLibraries_ByLibraryId() throws Exception {
        Page<ServiceLibrary> page = new PageImpl<>(List.of(testServiceLibrary));
        when(repository.findByLibraryId(eq(1L), any())).thenReturn(page);

        mockMvc.perform(get("/api/v1/service-libraries").param("libraryId", "1"))
                .andExpect(status().isOk());
    }

    @Test
    void getServiceLibraries_All() throws Exception {
        Page<ServiceLibrary> page = new PageImpl<>(List.of(testServiceLibrary));
        when(repository.findAll(any(Pageable.class))).thenReturn(page);

        mockMvc.perform(get("/api/v1/service-libraries"))
                .andExpect(status().isOk());
    }

    @Test
    void getServiceLibraryById_Found() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.of(testServiceLibrary));

        mockMvc.perform(get("/api/v1/service-libraries/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1));
    }

    @Test
    void getServiceLibraryById_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/service-libraries/1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void createServiceLibrary_Success() throws Exception {
        when(repository.findByServiceIdAndLibraryId(1L, 1L)).thenReturn(Optional.empty());
        when(repository.save(any(ServiceLibrary.class))).thenReturn(testServiceLibrary);

        mockMvc.perform(post("/api/v1/service-libraries")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"serviceId\":1,\"libraryId\":1,\"isDirect\":true}"))
                .andExpect(status().isCreated());
    }

    @Test
    void createServiceLibrary_Duplicate() throws Exception {
        when(repository.findByServiceIdAndLibraryId(1L, 1L)).thenReturn(Optional.of(testServiceLibrary));

        mockMvc.perform(post("/api/v1/service-libraries")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"serviceId\":1,\"libraryId\":1}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateServiceLibrary_Success() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.of(testServiceLibrary));
        when(repository.save(any(ServiceLibrary.class))).thenReturn(testServiceLibrary);

        mockMvc.perform(put("/api/v1/service-libraries/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"serviceId\":1,\"libraryId\":1}"))
                .andExpect(status().isOk());
    }

    @Test
    void updateServiceLibrary_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/v1/service-libraries/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"serviceId\":1,\"libraryId\":1}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteServiceLibrary_Success() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.of(testServiceLibrary));
        doNothing().when(repository).deleteById(1L);

        mockMvc.perform(delete("/api/v1/service-libraries/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteServiceLibrary_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/v1/service-libraries/1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteServiceLibraryByServiceAndLibrary_Found() throws Exception {
        when(repository.findByServiceIdAndLibraryId(1L, 1L)).thenReturn(Optional.of(testServiceLibrary));
        doNothing().when(repository).delete(any(ServiceLibrary.class));

        mockMvc.perform(delete("/api/v1/service-libraries/service/1/library/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteServiceLibraryByServiceAndLibrary_NotFound() throws Exception {
        when(repository.findByServiceIdAndLibraryId(1L, 1L)).thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/v1/service-libraries/service/1/library/1"))
                .andExpect(status().isNotFound());
    }
}
