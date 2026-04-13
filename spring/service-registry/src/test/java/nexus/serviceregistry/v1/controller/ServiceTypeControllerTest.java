package nexus.serviceregistry.v1.controller;

import nexus.serviceregistry.v1.config.TestJpaConfig;
import nexus.serviceregistry.v1.entity.ServiceType;
import nexus.serviceregistry.v1.repository.ServiceTypeRepository;
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

@WebMvcTest(ServiceTypeController.class)
@Import(TestJpaConfig.class)
class ServiceTypeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ServiceTypeRepository repository;

    private ServiceType testServiceType;

    @BeforeEach
    void setUp() {
        testServiceType = new ServiceType();
        testServiceType.setId(1L);
        testServiceType.setName("Microservice");
        testServiceType.setDescription("Microservice type");
    }

    @Test
    void getAll() throws Exception {
        Page<ServiceType> page = new PageImpl<>(List.of(testServiceType));
        when(repository.findAll(any(Pageable.class))).thenReturn(page);

        mockMvc.perform(get("/api/v1/service-types"))
                .andExpect(status().isOk());
    }

    @Test
    void getById_Found() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.of(testServiceType));

        mockMvc.perform(get("/api/v1/service-types/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.name").value("Microservice"));
    }

    @Test
    void getById_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/service-types/1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void create_Success() throws Exception {
        when(repository.save(any(ServiceType.class))).thenReturn(testServiceType);

        mockMvc.perform(post("/api/v1/service-types")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Microservice\",\"description\":\"Microservice type\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void update_Success() throws Exception {
        ServiceType existing = new ServiceType();
        existing.setId(1L);
        existing.setName("Old Name");

        ServiceType details = new ServiceType();
        details.setName("New Name");

        when(repository.findById(1L)).thenReturn(Optional.of(existing));
        when(repository.save(any(ServiceType.class))).thenReturn(existing);

        mockMvc.perform(put("/api/v1/service-types/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New Name\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void update_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/v1/service-types/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New Name\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void delete_Success() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.of(testServiceType));
        doNothing().when(repository).delete(any(ServiceType.class));

        mockMvc.perform(delete("/api/v1/service-types/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void delete_NotFound() throws Exception {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/v1/service-types/1"))
                .andExpect(status().isNotFound());
    }
}
