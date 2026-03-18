package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.client.ServicesConsoleClient;
import com.angrysurfer.spring.nexus.entity.Framework;
import com.angrysurfer.spring.nexus.entity.Service;
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

import java.net.URI;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ServiceControllerTest {

    @Mock
    private ServicesConsoleClient client;

    @Mock
    private ServiceRepository serviceRepository;

    @InjectMocks
    private ServiceController serviceController;

    private Service testService;
    private Framework testFramework;

    @BeforeEach
    void setUp() {
        org.springframework.mock.web.MockHttpServletRequest request = new org.springframework.mock.web.MockHttpServletRequest();
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
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
    void getServices_ByName_Found() {
        when(serviceRepository.findByName("Test Service")).thenReturn(Optional.of(testService));

        ResponseEntity<?> response = serviceController.getServices("Test Service", null, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testService, response.getBody());
        verify(serviceRepository).findByName("Test Service");
    }

    @Test
    void getServices_ByName_NotFound() {
        when(serviceRepository.findByName("Nonexistent")).thenReturn(Optional.empty());

        ResponseEntity<?> response = serviceController.getServices("Nonexistent", null, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void getServices_ByFrameworkId() {
        Page<Service> servicePage = new PageImpl<>(List.of(testService));
        when(serviceRepository.findByFramework_Id(eq(1L), any(Pageable.class))).thenReturn(servicePage);

        ResponseEntity<?> response = serviceController.getServices(null, 1L, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(serviceRepository).findByFramework_Id(eq(1L), any(Pageable.class));
    }

    @Test
    void getServices_Standalone() {
        Page<Service> servicePage = new PageImpl<>(List.of(testService));
        when(serviceRepository.findByParentServiceIsNull(any(Pageable.class))).thenReturn(servicePage);

        ResponseEntity<?> response = serviceController.getServices(null, null, true, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(serviceRepository).findByParentServiceIsNull(any(Pageable.class));
    }

    @Test
    void getServices_All() {
        Page<Service> servicePage = new PageImpl<>(List.of(testService));
        when(serviceRepository.findAll(any(Pageable.class))).thenReturn(servicePage);

        ResponseEntity<?> response = serviceController.getServices(null, null, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(serviceRepository).findAll(any(Pageable.class));
    }

    @Test
    void getServiceById_Found() {
        when(serviceRepository.findById(1L)).thenReturn(Optional.of(testService));

        ResponseEntity<Service> response = serviceController.getServiceById(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testService, response.getBody());
    }

    @Test
    void getServiceById_NotFound() {
        when(serviceRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Service> response = serviceController.getServiceById(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void getServiceDependencies() {
        ResponseEntity<List<Service>> response = serviceController.getServiceDependencies(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().isEmpty());
    }

    @Test
    void getServiceDependents() {
        ResponseEntity<List<Service>> response = serviceController.getServiceDependents("1");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().isEmpty());
    }

    @Test
    void getSubModules() {
        when(serviceRepository.findByParentService_Id(1L)).thenReturn(List.of(testService));

        ResponseEntity<List<Service>> response = serviceController.getSubModules(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(1, response.getBody().size());
    }

    @Test
    void createService_Success() {
        when(serviceRepository.findByName("Test Service")).thenReturn(Optional.empty());
        when(serviceRepository.save(any(Service.class))).thenReturn(testService);

        ResponseEntity<Service> response = serviceController.createService(testService);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().getActiveFlag());
        verify(serviceRepository).save(any(Service.class));
    }

    @Test
    void createService_DuplicateName() {
        when(serviceRepository.findByName("Test Service")).thenReturn(Optional.of(testService));

        ResponseEntity<Service> response = serviceController.createService(testService);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verify(serviceRepository, never()).save(any(Service.class));
    }

    @Test
    void updateService_Success() {
        Service existingService = new Service();
        existingService.setId(1L);
        existingService.setName("Old Name");

        Service updatedService = new Service();
        updatedService.setName("New Name");

        when(serviceRepository.findById(1L)).thenReturn(Optional.of(existingService));
        when(serviceRepository.findByName("New Name")).thenReturn(Optional.empty());
        when(serviceRepository.save(any(Service.class))).thenReturn(updatedService);

        ResponseEntity<Service> response = serviceController.updateService(1L, updatedService);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(serviceRepository).save(any(Service.class));
    }

    @Test
    void updateService_NotFound() {
        when(serviceRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Service> response = serviceController.updateService(1L, testService);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(serviceRepository, never()).save(any(Service.class));
    }

    @Test
    void updateService_DuplicateName() {
        Service existingService = new Service();
        existingService.setId(1L);
        existingService.setName("Old Name");

        Service updatedService = new Service();
        updatedService.setName("Existing Name");

        when(serviceRepository.findById(1L)).thenReturn(Optional.of(existingService));
        when(serviceRepository.findByName("Existing Name")).thenReturn(Optional.of(new Service()));

        ResponseEntity<Service> response = serviceController.updateService(1L, updatedService);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void deleteService_Success() {
        when(serviceRepository.findById(1L)).thenReturn(Optional.of(testService));
        doNothing().when(serviceRepository).deleteById(1L);

        ResponseEntity<Void> response = serviceController.deleteService(1L);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(serviceRepository).deleteById(1L);
    }

    @Test
    void deleteService_NotFound() {
        when(serviceRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Void> response = serviceController.deleteService(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(serviceRepository, never()).deleteById(anyLong());
    }
}
