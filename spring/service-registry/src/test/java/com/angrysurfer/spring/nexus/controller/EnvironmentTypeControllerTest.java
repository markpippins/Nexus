package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.EnvironmentType;
import com.angrysurfer.spring.nexus.repository.EnvironmentTypeRepository;
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
class EnvironmentTypeControllerTest {

    @Mock
    private EnvironmentTypeRepository repository;

    @InjectMocks
    private EnvironmentTypeController controller;

    private EnvironmentType testEnvironment;

    @BeforeEach
    void setUp() {
        org.springframework.mock.web.MockHttpServletRequest request = new org.springframework.mock.web.MockHttpServletRequest();
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
        testEnvironment = new EnvironmentType();
        testEnvironment.setId(1L);
        testEnvironment.setName("Development");
        testEnvironment.setActiveFlag(true);
    }

    @Test
    void getAll() {
        Page<EnvironmentType> page = new PageImpl<>(List.of(testEnvironment));
        when(repository.findAll(any(Pageable.class))).thenReturn(page);

        org.springframework.data.domain.Page<EnvironmentType> result = controller.getAll(PageRequest.of(0, 10));

        assertEquals(1, result.getContent().size());
        verify(repository).findAll(any(Pageable.class));
    }

    @Test
    void getById_Found() {
        when(repository.findById(1L)).thenReturn(Optional.of(testEnvironment));

        ResponseEntity<EnvironmentType> response = controller.getById(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testEnvironment, response.getBody());
    }

    @Test
    void getById_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<EnvironmentType> response = controller.getById(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void create_Success() {
        when(repository.save(any(EnvironmentType.class))).thenReturn(testEnvironment);

        ResponseEntity<EnvironmentType> response = controller.create(testEnvironment);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        verify(repository).save(any(EnvironmentType.class));
    }

    @Test
    void update_Success() {
        EnvironmentType existing = new EnvironmentType();
        existing.setId(1L);
        existing.setName("Old Env");

        EnvironmentType details = new EnvironmentType();
        details.setName("New Env");

        when(repository.findById(1L)).thenReturn(Optional.of(existing));
        when(repository.save(any(EnvironmentType.class))).thenReturn(existing);

        ResponseEntity<EnvironmentType> response = controller.update(1L, details);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(repository).save(any(EnvironmentType.class));
    }

    @Test
    void update_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<EnvironmentType> response = controller.update(1L, testEnvironment);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void delete_Success() {
        when(repository.findById(1L)).thenReturn(Optional.of(testEnvironment));
        doNothing().when(repository).delete(any(EnvironmentType.class));

        ResponseEntity<Void> response = controller.delete(1L);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(repository).delete(any(EnvironmentType.class));
    }

    @Test
    void delete_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Void> response = controller.delete(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }
}
