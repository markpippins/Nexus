package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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
import com.aibizarchitect.nexus.v1.spring.serviceregistry.controller.DeploymentController;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Deployment;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Server;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.DeploymentRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.StatusEventRepository;

@WebMvcTest(DeploymentController.class)
@Import(TestJpaConfig.class)
class DeploymentControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ServicesConsoleClient client;

    @MockBean
    private DeploymentRepository deploymentRepository;

    @MockBean
    private ServiceRepository serviceRepository;

    @MockBean
    private StatusEventRepository statusEventRepository;

    private Deployment testDeployment;
    private Service testService;
    private Server testServer;

    @BeforeEach
    void setUp() {
        testService = new Service();
        testService.setId(1L);
        testService.setName("Test Service");

        testServer = new Server();
        testServer.setId(1L);
        testServer.setHostname("test-server");

        testDeployment = new Deployment();
        testDeployment.setId(1L);
        testDeployment.setService(testService);
        testDeployment.setServer(testServer);
        testDeployment.setVersion("1.0.0");
        testDeployment.setStatus("RUNNING");
        testDeployment.setHealthStatus("HEALTHY");
        testDeployment.setActiveFlag(true);
    }

    @Test
    void getDeployments_ByServiceId() throws Exception {
        Page<Deployment> deploymentPage = new PageImpl<>(List.of(testDeployment));
        when(deploymentRepository.findByService_Id(eq(1L), any())).thenReturn(deploymentPage);

        mockMvc.perform(get("/api/v1/deployments").param("serviceId", "1"))
                .andExpect(status().isOk());
    }

    @Test
    void getDeployments_All() throws Exception {
        Page<Deployment> deploymentPage = new PageImpl<>(List.of(testDeployment));
        when(deploymentRepository.findAll(any(Pageable.class))).thenReturn(deploymentPage);

        mockMvc.perform(get("/api/v1/deployments"))
                .andExpect(status().isOk());
    }

    @Test
    void getDeploymentById_Found() throws Exception {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));

        mockMvc.perform(get("/api/v1/deployments/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1));
    }

    @Test
    void getDeploymentById_NotFound() throws Exception {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/deployments/1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void createDeployment_Success() throws Exception {
        when(deploymentRepository.save(any(Deployment.class))).thenReturn(testDeployment);

        mockMvc.perform(post("/api/v1/deployments")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"version\":\"1.0.0\",\"status\":\"RUNNING\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void updateDeployment_Success() throws Exception {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));
        when(deploymentRepository.save(any(Deployment.class))).thenReturn(testDeployment);

        mockMvc.perform(put("/api/v1/deployments/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"version\":\"1.0.0\",\"status\":\"RUNNING\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void updateDeployment_NotFound() throws Exception {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/v1/deployments/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"version\":\"1.0.0\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteDeployment_Success() throws Exception {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));
        when(serviceRepository.findByParentService_Id(1L)).thenReturn(List.of());
        doNothing().when(deploymentRepository).deleteById(1L);

        mockMvc.perform(delete("/api/v1/deployments/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteDeployment_NotFound() throws Exception {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/v1/deployments/1"))
                .andExpect(status().isNotFound());
    }

    // ================================================================
    // ORANGE PATH — expected, handled failure
    // ================================================================

    @Test
    void createDeployment_MalformedJson_returns400() throws Exception {
        mockMvc.perform(post("/api/v1/deployments")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{bad json"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getDeployments_InvalidServiceIdType_returns400() throws Exception {
        mockMvc.perform(get("/api/v1/deployments").param("serviceId", "abc"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createDeployment_EmptyVersionField_handled() throws Exception {
        when(deploymentRepository.save(any(Deployment.class))).thenReturn(testDeployment);

        mockMvc.perform(post("/api/v1/deployments")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"version\":\"\",\"status\":\"RUNNING\"}"))
                .andExpect(status().isCreated());
    }

    // ================================================================
    // RED PATH — adversarial input the system must survive
    // ================================================================

    @Test
    void createDeployment_SqlInjectionInVersion_handled() throws Exception {
        when(deploymentRepository.save(any(Deployment.class))).thenReturn(testDeployment);

        mockMvc.perform(post("/api/v1/deployments")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"version\":\"'; DROP TABLE deployments; --\",\"status\":\"RUNNING\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void getDeploymentById_NegativeId_returnsNotFound() throws Exception {
        mockMvc.perform(get("/api/v1/deployments/-1"))
                .andExpect(status().isNotFound());
    }

    // ================================================================
    // SILENT FAILURE — metamorphic/determinism coverage
    // ================================================================

    @Test
    void metamorphic_getByIdSameInput_producesSameOutput() throws Exception {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));

        String response1 = mockMvc.perform(get("/api/v1/deployments/1"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String response2 = mockMvc.perform(get("/api/v1/deployments/1"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertEquals(response1, response2, "Same deployment should produce identical JSON");
    }

    @Test
    void metamorphic_differentDeployments_produceDifferentOutput() throws Exception {
        Deployment other = new Deployment();
        other.setId(2L);
        other.setVersion("2.0.0");

        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));
        when(deploymentRepository.findById(2L)).thenReturn(Optional.of(other));

        String response1 = mockMvc.perform(get("/api/v1/deployments/1"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String response2 = mockMvc.perform(get("/api/v1/deployments/2"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertNotEquals(response1, response2, "Different deployments MUST produce different JSON");
    }

    @Test
    void regressionLock_notFound_emptyBody() throws Exception {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.empty());

        String body = mockMvc.perform(get("/api/v1/deployments/1"))
                .andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();

        assertEquals("", body, "404 responses currently empty — regression lock");
    }

    // ================================================================
    // LIFECYCLE OPS (D-BP-1) — start / stop / restart
    // Idempotency + invalid-transition rejection + history recording
    // ================================================================

    @Test
    void start_Success_transitionsToRunning_andRecordsEvent() throws Exception {
        testDeployment.setStatus("STOPPED");
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));
        when(deploymentRepository.save(any(Deployment.class))).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(post("/api/v1/deployments/1/start"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RUNNING"))
                .andExpect(jsonPath("$.changed").value(true));

        verify(statusEventRepository).save(any());
    }

    @Test
    void start_IdempotentWhenRunning_noStateChange() throws Exception {
        testDeployment.setStatus("RUNNING");
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));

        mockMvc.perform(post("/api/v1/deployments/1/start"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.changed").value(false));

        verify(deploymentRepository, never()).save(any());
    }

    @Test
    void start_IdempotentWhenStarting() throws Exception {
        testDeployment.setStatus("STARTING");
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));

        mockMvc.perform(post("/api/v1/deployments/1/start"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.changed").value(false));
    }

    @Test
    void start_RejectsWhileStopping_409() throws Exception {
        testDeployment.setStatus("STOPPING");
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));

        mockMvc.perform(post("/api/v1/deployments/1/start"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("invalid-transition"))
                .andExpect(jsonPath("$.currentStatus").value("STOPPING"));

        verify(deploymentRepository, never()).save(any());
    }

    @Test
    void start_NotFound_404() throws Exception {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/v1/deployments/1/start"))
                .andExpect(status().isNotFound());
    }

    @Test
    void stop_Success_transitionsToStopped_andRecordsEvent() throws Exception {
        testDeployment.setStatus("RUNNING");
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));
        when(deploymentRepository.save(any(Deployment.class))).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(post("/api/v1/deployments/1/stop"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("STOPPED"))
                .andExpect(jsonPath("$.changed").value(true));

        verify(statusEventRepository).save(any());
    }

    @Test
    void stop_IdempotentWhenStopped() throws Exception {
        testDeployment.setStatus("STOPPED");
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));

        mockMvc.perform(post("/api/v1/deployments/1/stop"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.changed").value(false));

        verify(deploymentRepository, never()).save(any());
    }

    @Test
    void stop_RejectsWhileStarting_409() throws Exception {
        testDeployment.setStatus("STARTING");
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));

        mockMvc.perform(post("/api/v1/deployments/1/stop"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("invalid-transition"))
                .andExpect(jsonPath("$.currentStatus").value("STARTING"));

        verify(deploymentRepository, never()).save(any());
    }

    @Test
    void stop_NotFound_404() throws Exception {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/v1/deployments/1/stop"))
                .andExpect(status().isNotFound());
    }

    @Test
    void restart_composesStopThenStart() throws Exception {
        // Stopped deployment -> stop is a no-op (already stopped), start brings it to RUNNING
        testDeployment.setStatus("STOPPED");
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));
        when(deploymentRepository.save(any(Deployment.class))).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(post("/api/v1/deployments/1/restart"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RUNNING"));
    }

    @Test
    void restart_propagatesStopConflict() throws Exception {
        // Starting deployment -> stop leg rejects 409; restart must not proceed
        testDeployment.setStatus("STARTING");
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));

        mockMvc.perform(post("/api/v1/deployments/1/restart"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("invalid-transition"));

        verify(deploymentRepository, never()).save(any());
    }
}
