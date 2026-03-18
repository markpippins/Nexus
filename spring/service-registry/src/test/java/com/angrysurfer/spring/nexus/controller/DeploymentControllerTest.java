package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.client.ServicesConsoleClient;
import com.angrysurfer.spring.nexus.entity.Deployment;
import com.angrysurfer.spring.nexus.entity.Host;
import com.angrysurfer.spring.nexus.entity.Service;
import com.angrysurfer.spring.nexus.repository.DeploymentRepository;
import com.angrysurfer.spring.nexus.repository.ServiceRepository;
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
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DeploymentControllerTest {

    @Mock
    private ServicesConsoleClient client;

    @Mock
    private DeploymentRepository deploymentRepository;

    @Mock
    private ServiceRepository serviceRepository;

    @InjectMocks
    private DeploymentController deploymentController;

    private Deployment testDeployment;
    private Service testService;
    private Host testServer;

    @BeforeEach
    void setUp() {
        org.springframework.mock.web.MockHttpServletRequest request = new org.springframework.mock.web.MockHttpServletRequest();
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
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
    void getDeployments_ByServiceId() {
        Page<Deployment> deploymentPage = new PageImpl<>(List.of(testDeployment));
        when(deploymentRepository.findByService_Id(eq(1L), any(Pageable.class))).thenReturn(deploymentPage);

        ResponseEntity<Page<Deployment>> response = deploymentController.getDeployments(1L, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(deploymentRepository).findByService_Id(eq(1L), any(Pageable.class));
    }

    @Test
    void getDeployments_All() {
        Page<Deployment> deploymentPage = new PageImpl<>(List.of(testDeployment));
        when(deploymentRepository.findAll(any(Pageable.class))).thenReturn(deploymentPage);

        ResponseEntity<Page<Deployment>> response = deploymentController.getDeployments(null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(deploymentRepository).findAll(any(Pageable.class));
    }

    @Test
    void getDeploymentById_Found() {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));

        ResponseEntity<Deployment> response = deploymentController.getDeploymentById(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testDeployment, response.getBody());
    }

    @Test
    void getDeploymentById_NotFound() {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Deployment> response = deploymentController.getDeploymentById(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void createDeployment_Success() {
        when(deploymentRepository.save(any(Deployment.class))).thenReturn(testDeployment);

        ResponseEntity<Deployment> response = deploymentController.createDeployment(testDeployment);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().getActiveFlag());
        verify(deploymentRepository).save(any(Deployment.class));
    }

    @Test
    void createDeployment_WithSubModules() {
        Service subModule = new Service();
        subModule.setId(2L);
        subModule.setName("Sub Module");

        when(serviceRepository.findByParentService_Id(1L)).thenReturn(List.of(subModule));
        when(deploymentRepository.save(any(Deployment.class))).thenReturn(testDeployment, new Deployment());

        ResponseEntity<Deployment> response = deploymentController.createDeployment(testDeployment);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        verify(deploymentRepository, times(2)).save(any(Deployment.class));
    }

    @Test
    void updateDeployment_Success() {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));
        when(deploymentRepository.save(any(Deployment.class))).thenReturn(testDeployment);

        ResponseEntity<Deployment> response = deploymentController.updateDeployment(1L, testDeployment);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(deploymentRepository).save(any(Deployment.class));
    }

    @Test
    void updateDeployment_NotFound() {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Deployment> response = deploymentController.updateDeployment(1L, testDeployment);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(deploymentRepository, never()).save(any(Deployment.class));
    }

    @Test
    void updateDeploymentStatus_Success() {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));
        when(deploymentRepository.save(any(Deployment.class))).thenReturn(testDeployment);

        ResponseEntity<Deployment> response = deploymentController.updateDeploymentStatus(1L, "STOPPED");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(deploymentRepository).save(any(Deployment.class));
    }

    @Test
    void updateDeploymentStatus_NotFound() {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Deployment> response = deploymentController.updateDeploymentStatus(1L, "STOPPED");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void updateDeploymentHealth_Success() {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));
        when(deploymentRepository.save(any(Deployment.class))).thenReturn(testDeployment);

        ResponseEntity<Deployment> response = deploymentController.updateDeploymentHealth(1L, "UNHEALTHY");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(deploymentRepository).save(any(Deployment.class));
    }

    @Test
    void updateDeploymentHealth_NotFound() {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Deployment> response = deploymentController.updateDeploymentHealth(1L, "UNHEALTHY");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void deleteDeployment_Success() {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));
        when(serviceRepository.findByParentService_Id(1L)).thenReturn(List.of());
        doNothing().when(deploymentRepository).deleteById(1L);

        ResponseEntity<Void> response = deploymentController.deleteDeployment(1L);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(deploymentRepository).deleteById(1L);
    }

    @Test
    void deleteDeployment_WithSubModules() {
        Service subModule = new Service();
        subModule.setId(2L);

        Deployment subDeployment = new Deployment();
        subDeployment.setId(2L);
        subDeployment.setServer(testServer);

        when(deploymentRepository.findById(1L)).thenReturn(Optional.of(testDeployment));
        when(serviceRepository.findByParentService_Id(1L)).thenReturn(List.of(subModule));
        when(deploymentRepository.findByService_Id(2L)).thenReturn(List.of(subDeployment));
        doNothing().when(deploymentRepository).deleteById(anyLong());

        ResponseEntity<Void> response = deploymentController.deleteDeployment(1L);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(deploymentRepository, times(2)).deleteById(anyLong());
    }

    @Test
    void deleteDeployment_NotFound() {
        when(deploymentRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Void> response = deploymentController.deleteDeployment(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(deploymentRepository, never()).deleteById(anyLong());
    }
}
