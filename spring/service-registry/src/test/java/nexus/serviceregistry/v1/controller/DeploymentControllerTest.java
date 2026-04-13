package nexus.serviceregistry.v1.controller;

import nexus.serviceregistry.v1.client.ServicesConsoleClient;
import nexus.serviceregistry.v1.config.TestJpaConfig;
import nexus.serviceregistry.v1.entity.Deployment;
import nexus.serviceregistry.v1.entity.Host;
import nexus.serviceregistry.v1.entity.Service;
import nexus.serviceregistry.v1.repository.DeploymentRepository;
import nexus.serviceregistry.v1.repository.ServiceRepository;
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

    private Deployment testDeployment;
    private Service testService;
    private Host testServer;

    @BeforeEach
    void setUp() {
        testService = new Service();
        testService.setId(1L);
        testService.setName("Test Service");

        testServer = new Host();
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
    void updateDeploymentStatus_Success() throws Exception {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));
        when(deploymentRepository.save(any(Deployment.class))).thenReturn(testDeployment);

        mockMvc.perform(patch("/api/v1/deployments/1/status").param("status", "STOPPED"))
                .andExpect(status().isOk());
    }

    @Test
    void updateDeploymentStatus_NotFound() throws Exception {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(patch("/api/v1/deployments/1/status").param("status", "STOPPED"))
                .andExpect(status().isNotFound());
    }

    @Test
    void updateDeploymentHealth_Success() throws Exception {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));
        when(deploymentRepository.save(any(Deployment.class))).thenReturn(testDeployment);

        mockMvc.perform(patch("/api/v1/deployments/1/health").param("healthStatus", "UNHEALTHY"))
                .andExpect(status().isOk());
    }

    @Test
    void updateDeploymentHealth_NotFound() throws Exception {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(patch("/api/v1/deployments/1/health").param("healthStatus", "UNHEALTHY"))
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
}
