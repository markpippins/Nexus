package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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

import com.aibizarchitect.nexus.v1.spring.serviceregistry.client.ServicesConsoleClient;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.config.TestJpaConfig;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.controller.ServiceController;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Framework;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceRepository;

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

    // ================================================================
    // ORANGE PATH — expected, handled failure
    // ================================================================

    @Test
    void createService_MalformedJson_returns400() throws Exception {
        mockMvc.perform(post("/api/v1/services")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{bad json"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createService_BlankName_throwsDataIntegrityViolation() {
        // Name is @Column(nullable=false, unique=true) — Hibernate should reject blank/null
        when(serviceRepository.findByName(" ")).thenReturn(Optional.empty());
        when(serviceRepository.save(any(Service.class))).thenThrow(
                new org.springframework.dao.DataIntegrityViolationException("not-null constraint"));

        org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () ->
                mockMvc.perform(post("/api/v1/services")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\" \"}")));
    }

    @Test
    void getServices_InvalidFrameworkIdType_returns400() throws Exception {
        mockMvc.perform(get("/api/v1/services").param("frameworkId", "abc"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateService_NullNameInBody_allowsSave() throws Exception {
        // GAP: null name passes controller validation — only DB constraint would catch it
        Service existing = new Service();
        existing.setId(1L);
        existing.setName("Old Name");

        when(serviceRepository.findById(1L)).thenReturn(Optional.of(existing));
        when(serviceRepository.findByName(null)).thenReturn(Optional.empty());
        when(serviceRepository.save(any(Service.class))).thenReturn(existing);

        mockMvc.perform(put("/api/v1/services/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":null}"))
                .andExpect(status().isOk());
    }

    // ================================================================
    // RED PATH — adversarial input the system must survive
    // ================================================================

    @Test
    void getServices_SqlInjectionInNameParam_returnsOk() throws Exception {
        when(serviceRepository.findByName("' OR '1'='1")).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/services").param("name", "' OR '1'='1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getServices_PathTraversalInNameParam_returnsOk() throws Exception {
        when(serviceRepository.findByName("../../etc/passwd")).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/services").param("name", "../../etc/passwd"))
                .andExpect(status().isNotFound());
    }

    @Test
    void createService_ExtremelyLongName_handled() throws Exception {
        String longName = "x".repeat(500);
        when(serviceRepository.findByName(longName)).thenReturn(Optional.empty());
        when(serviceRepository.save(any(Service.class))).thenReturn(testService);

        mockMvc.perform(post("/api/v1/services")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + longName + "\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void getServiceById_NegativeId_returnsNotFound() throws Exception {
        mockMvc.perform(get("/api/v1/services/-1"))
                .andExpect(status().isNotFound());
    }

    // ================================================================
    // SILENT FAILURE — metamorphic/determinism coverage
    // ================================================================

    @Test
    void errorResponse_DuplicateName_hasConsistentFormat() throws Exception {
        when(serviceRepository.findByName("Test Service")).thenReturn(Optional.of(testService));

        String response1 = mockMvc.perform(post("/api/v1/services")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Test Service\"}"))
                .andExpect(status().isBadRequest())
                .andReturn().getResponse().getContentAsString();

        when(serviceRepository.findByName("Test Service")).thenReturn(Optional.of(testService));

        String response2 = mockMvc.perform(post("/api/v1/services")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Test Service\"}"))
                .andExpect(status().isBadRequest())
                .andReturn().getResponse().getContentAsString();

        // Regression lock: duplicate-name rejection produces consistent empty body
        assertEquals("", response1);
        assertEquals(response1, response2);
    }

    @Test
    void metamorphic_getByIdSameInput_producesSameOutput() throws Exception {
        when(serviceRepository.findById(1L)).thenReturn(Optional.of(testService));

        String response1 = mockMvc.perform(get("/api/v1/services/1"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String response2 = mockMvc.perform(get("/api/v1/services/1"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertEquals(response1, response2, "Same entity should produce identical JSON");
    }

    @Test
    void metamorphic_differentServices_produceDifferentOutput() throws Exception {
        Service otherService = new Service();
        otherService.setId(2L);
        otherService.setName("Other Service");

        when(serviceRepository.findById(1L)).thenReturn(Optional.of(testService));
        when(serviceRepository.findById(2L)).thenReturn(Optional.of(otherService));

        String response1 = mockMvc.perform(get("/api/v1/services/1"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String response2 = mockMvc.perform(get("/api/v1/services/2"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertNotEquals(response1, response2, "Different entities MUST produce different JSON");
    }

    @Test
    void metamorphic_notFound_producesConsistentEmptyBody() throws Exception {
        when(serviceRepository.findById(1L)).thenReturn(Optional.empty());

        String response1 = mockMvc.perform(get("/api/v1/services/1"))
                .andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();

        // GAP: ResponseEntity.notFound().build() produces empty body
        // This is a regression lock — if body format changes, we need to know
        assertEquals("", response1, "404 responses currently have empty body — regression lock");
    }
}
