package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.dto.DeploymentWithBackendsDto;
import com.angrysurfer.spring.nexus.dto.ServiceBackendDto;
import com.angrysurfer.spring.nexus.entity.ServiceBackend;
import com.angrysurfer.spring.nexus.service.ServiceBackendService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ServiceBackendControllerTest {

    @Mock
    private ServiceBackendService serviceBackendService;

    @InjectMocks
    private ServiceBackendController controller;

    private ServiceBackendDto testBackendDto;
    private ServiceBackend testBackend;

    @BeforeEach
    void setUp() {
        org.springframework.mock.web.MockHttpServletRequest request = new org.springframework.mock.web.MockHttpServletRequest();
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
        testBackendDto = new ServiceBackendDto();
        testBackendDto.setId(1L);
        testBackendDto.setServiceDeploymentId(1L);
        testBackendDto.setBackendDeploymentId(2L);
        testBackendDto.setRole(ServiceBackend.BackendRole.PRIMARY);

        testBackend = new ServiceBackend();
        testBackend.setId(1L);
        testBackend.setServiceDeploymentId(1L);
        testBackend.setBackendDeploymentId(2L);
        testBackend.setRole(ServiceBackend.BackendRole.PRIMARY);
    }

    @Test
    void getBackendsForDeployment() {
        List<ServiceBackendDto> backends = List.of(testBackendDto);
        when(serviceBackendService.getBackendsForDeployment(1L)).thenReturn(backends);

        ResponseEntity<Page<ServiceBackendDto>> response = controller.getBackendsForDeployment(1L, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(serviceBackendService).getBackendsForDeployment(1L);
    }

    @Test
    void getConsumersForDeployment() {
        List<ServiceBackendDto> consumers = List.of(testBackendDto);
        when(serviceBackendService.getConsumersForDeployment(1L)).thenReturn(consumers);

        ResponseEntity<Page<ServiceBackendDto>> response = controller.getConsumersForDeployment(1L, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(serviceBackendService).getConsumersForDeployment(1L);
    }

    @Test
    void getDeploymentWithBackends() {
        DeploymentWithBackendsDto dto = new DeploymentWithBackendsDto();
        when(serviceBackendService.getDeploymentWithBackends(1L)).thenReturn(dto);

        ResponseEntity<DeploymentWithBackendsDto> response = controller.getDeploymentWithBackends(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(serviceBackendService).getDeploymentWithBackends(1L);
    }

    @Test
    void addBackend_Success() {
        Map<String, Object> request = Map.of(
                "serviceDeploymentId", "1",
                "backendDeploymentId", "2",
                "role", "PRIMARY",
                "priority", 1
        );

        when(serviceBackendService.addBackend(eq(1L), eq(2L), eq(ServiceBackend.BackendRole.PRIMARY), eq(1)))
                .thenReturn(testBackend);

        ResponseEntity<ServiceBackend> response = controller.addBackend(request);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        verify(serviceBackendService).addBackend(eq(1L), eq(2L), eq(ServiceBackend.BackendRole.PRIMARY), eq(1));
    }

    @Test
    void addBackend_DefaultRole() {
        Map<String, Object> request = Map.of(
                "serviceDeploymentId", "1",
                "backendDeploymentId", "2"
        );

        when(serviceBackendService.addBackend(eq(1L), eq(2L), eq(ServiceBackend.BackendRole.PRIMARY), anyInt()))
                .thenReturn(testBackend);

        ResponseEntity<ServiceBackend> response = controller.addBackend(request);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
    }

    @Test
    void updateBackend_Success() {
        when(serviceBackendService.updateBackend(eq(1L), any(ServiceBackendDto.class))).thenReturn(testBackend);

        ResponseEntity<ServiceBackend> response = controller.updateBackend(1L, testBackendDto);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(serviceBackendService).updateBackend(eq(1L), any(ServiceBackendDto.class));
    }

    @Test
    void removeBackend() {
        doNothing().when(serviceBackendService).removeBackend(1L);

        ResponseEntity<Void> response = controller.removeBackend(1L);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(serviceBackendService).removeBackend(1L);
    }
}
