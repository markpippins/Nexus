package nexus.serviceregistry.v1.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.angrysurfer.nexus.dto.DeploymentWithBackendsDto;
import com.angrysurfer.nexus.dto.ServiceBackendDto;

import nexus.serviceregistry.v1.config.TestJpaConfig;
import nexus.serviceregistry.v1.entity.ServiceBackend;
import nexus.serviceregistry.v1.service.ServiceBackendService;

@WebMvcTest(ServiceBackendController.class)
@Import(TestJpaConfig.class)
class ServiceBackendControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ServiceBackendService serviceBackendService;

    private ServiceBackendDto testBackendDto;
    private ServiceBackend testBackend;

    @BeforeEach
    void setUp() {
        testBackendDto = new ServiceBackendDto();
        testBackendDto.setId(1L);
        testBackendDto.setServiceDeploymentId(1L);
        testBackendDto.setBackendDeploymentId(2L);
        testBackendDto.setRole("PRIMARY");

        testBackend = new ServiceBackend();
        testBackend.setId(1L);
        testBackend.setServiceDeploymentId(1L);
        testBackend.setBackendDeploymentId(2L);
        testBackend.setRole(ServiceBackend.BackendRole.PRIMARY);
    }

    @Test
    void getBackendsForDeployment() throws Exception {
        List<ServiceBackendDto> backends = List.of(testBackendDto);
        when(serviceBackendService.getBackendsForDeployment(1L)).thenReturn(backends);

        mockMvc.perform(get("/api/v1/backends/deployment/1"))
                .andExpect(status().isOk());
    }

    @Test
    void getConsumersForDeployment() throws Exception {
        List<ServiceBackendDto> consumers = List.of(testBackendDto);
        when(serviceBackendService.getConsumersForDeployment(1L)).thenReturn(consumers);

        mockMvc.perform(get("/api/v1/backends/consumers/1"))
                .andExpect(status().isOk());
    }

    @Test
    void getDeploymentWithBackends() throws Exception {
        DeploymentWithBackendsDto dto = new DeploymentWithBackendsDto();
        when(serviceBackendService.getDeploymentWithBackends(1L)).thenReturn(dto);

        mockMvc.perform(get("/api/v1/backends/deployment/1/details"))
                .andExpect(status().isOk());
    }

    @Test
    void addBackend_Success() throws Exception {
        when(serviceBackendService.addBackend(eq(1L), eq(2L), eq(ServiceBackend.BackendRole.PRIMARY), anyInt()))
                .thenReturn(testBackend);

        mockMvc.perform(post("/api/v1/backends")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"serviceDeploymentId\":1,\"backendDeploymentId\":2,\"role\":\"PRIMARY\",\"priority\":1}"))
                .andExpect(status().isCreated());
    }

    @Test
    void updateBackend_Success() throws Exception {
        when(serviceBackendService.updateBackend(eq(1L), any(ServiceBackendDto.class))).thenReturn(testBackend);

        mockMvc.perform(put("/api/v1/backends/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"serviceDeploymentId\":1,\"backendDeploymentId\":2,\"role\":\"PRIMARY\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void removeBackend() throws Exception {
        doNothing().when(serviceBackendService).removeBackend(1L);

        mockMvc.perform(delete("/api/v1/backends/1"))
                .andExpect(status().isNoContent());
    }
}
