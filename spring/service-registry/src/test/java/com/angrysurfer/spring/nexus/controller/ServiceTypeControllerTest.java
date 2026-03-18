package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.ServiceType;
import com.angrysurfer.spring.nexus.repository.ServiceTypeRepository;
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
class ServiceTypeControllerTest {

    @Mock
    private ServiceTypeRepository repository;

    @InjectMocks
    private ServiceTypeController controller;

    private ServiceType testServiceType;

    @BeforeEach
    void setUp() {
        org.springframework.mock.web.MockHttpServletRequest request = new org.springframework.mock.web.MockHttpServletRequest();
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
        testServiceType = new ServiceType();
        testServiceType.setId(1L);
        testServiceType.setName("Microservice");
        testServiceType.setDescription("Microservice type");
    }

    @Test
    void getAll() {
        Page<ServiceType> page = new PageImpl<>(List.of(testServiceType));
        when(repository.findAll(any(Pageable.class))).thenReturn(page);

        org.springframework.data.domain.Page<ServiceType> result = controller.getAll(PageRequest.of(0, 10));

        assertEquals(1, result.getContent().size());
        verify(repository).findAll(any(Pageable.class));
    }

    @Test
    void getById_Found() {
        when(repository.findById(1L)).thenReturn(Optional.of(testServiceType));

        ResponseEntity<ServiceType> response = controller.getById(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testServiceType, response.getBody());
    }

    @Test
    void getById_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<ServiceType> response = controller.getById(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void create_Success() {
        when(repository.save(any(ServiceType.class))).thenReturn(testServiceType);

        ResponseEntity<ServiceType> response = controller.create(testServiceType);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        verify(repository).save(any(ServiceType.class));
    }

    @Test
    void update_Success() {
        ServiceType existing = new ServiceType();
        existing.setId(1L);
        existing.setName("Old Name");

        ServiceType details = new ServiceType();
        details.setName("New Name");

        when(repository.findById(1L)).thenReturn(Optional.of(existing));
        when(repository.save(any(ServiceType.class))).thenReturn(existing);

        ResponseEntity<ServiceType> response = controller.update(1L, details);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(repository).save(any(ServiceType.class));
    }

    @Test
    void update_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<ServiceType> response = controller.update(1L, testServiceType);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void delete_Success() {
        when(repository.findById(1L)).thenReturn(Optional.of(testServiceType));
        doNothing().when(repository).delete(any(ServiceType.class));

        ResponseEntity<Void> response = controller.delete(1L);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(repository).delete(any(ServiceType.class));
    }

    @Test
    void delete_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Void> response = controller.delete(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }
}
