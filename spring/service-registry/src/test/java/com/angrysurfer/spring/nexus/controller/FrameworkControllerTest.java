package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.client.ServicesConsoleClient;
import com.angrysurfer.spring.nexus.entity.Framework;
import com.angrysurfer.spring.nexus.repository.FrameworkRepository;
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
class FrameworkControllerTest {

    @Mock
    private ServicesConsoleClient client;

    @Mock
    private FrameworkRepository frameworkRepository;

    @InjectMocks
    private FrameworkController frameworkController;

    private Framework testFramework;

    @BeforeEach
    void setUp() {
        org.springframework.mock.web.MockHttpServletRequest request = new org.springframework.mock.web.MockHttpServletRequest();
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
        testFramework = new Framework();
        testFramework.setId(1L);
        testFramework.setName("Spring Boot");
        testFramework.setSupportsBrokerPattern(true);
        testFramework.setActiveFlag(true);
    }

    @Test
    void getFrameworks_ByName_Found() {
        when(frameworkRepository.findByName("Spring Boot")).thenReturn(Optional.of(testFramework));

        ResponseEntity<?> response = frameworkController.getFrameworks("Spring Boot", null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testFramework, response.getBody());
        verify(frameworkRepository).findByName("Spring Boot");
    }

    @Test
    void getFrameworks_ByName_NotFound() {
        when(frameworkRepository.findByName("Nonexistent")).thenReturn(Optional.empty());

        ResponseEntity<?> response = frameworkController.getFrameworks("Nonexistent", null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void getFrameworks_BrokerCompatible() {
        Framework framework1 = new Framework();
        framework1.setId(1L);
        framework1.setName("Spring Boot");
        framework1.setSupportsBrokerPattern(true);

        Framework framework2 = new Framework();
        framework2.setId(2L);
        framework2.setName("Quarkus");
        framework2.setSupportsBrokerPattern(true);

        when(frameworkRepository.findAll()).thenReturn(List.of(framework1, framework2));

        ResponseEntity<?> response = frameworkController.getFrameworks(null, true, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(frameworkRepository).findAll();
    }

    @Test
    void getFrameworks_All() {
        Page<Framework> frameworkPage = new PageImpl<>(List.of(testFramework));
        when(frameworkRepository.findAll(any(Pageable.class))).thenReturn(frameworkPage);

        ResponseEntity<?> response = frameworkController.getFrameworks(null, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(frameworkRepository).findAll(any(Pageable.class));
    }

    @Test
    void getFrameworkById_Found() {
        when(frameworkRepository.findById(1L)).thenReturn(Optional.of(testFramework));

        ResponseEntity<Framework> response = frameworkController.getFrameworkById(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testFramework, response.getBody());
    }

    @Test
    void getFrameworkById_NotFound() {
        when(frameworkRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Framework> response = frameworkController.getFrameworkById(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void createFramework_Success() {
        when(frameworkRepository.findByName("Spring Boot")).thenReturn(Optional.empty());
        when(frameworkRepository.save(any(Framework.class))).thenReturn(testFramework);

        ResponseEntity<Framework> response = frameworkController.createFramework(testFramework);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().getActiveFlag());
        verify(frameworkRepository).save(any(Framework.class));
    }

    @Test
    void createFramework_DuplicateName() {
        when(frameworkRepository.findByName("Spring Boot")).thenReturn(Optional.of(testFramework));

        ResponseEntity<Framework> response = frameworkController.createFramework(testFramework);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verify(frameworkRepository, never()).save(any(Framework.class));
    }

    @Test
    void updateFramework_Success() {
        Framework existingFramework = new Framework();
        existingFramework.setId(1L);
        existingFramework.setName("Old Framework");

        Framework updatedFramework = new Framework();
        updatedFramework.setName("New Framework");

        when(frameworkRepository.findById(1L)).thenReturn(Optional.of(existingFramework));
        when(frameworkRepository.findByName("New Framework")).thenReturn(Optional.empty());
        when(frameworkRepository.save(any(Framework.class))).thenReturn(updatedFramework);

        ResponseEntity<Framework> response = frameworkController.updateFramework(1L, updatedFramework);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(frameworkRepository).save(any(Framework.class));
    }

    @Test
    void updateFramework_NotFound() {
        when(frameworkRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Framework> response = frameworkController.updateFramework(1L, testFramework);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(frameworkRepository, never()).save(any(Framework.class));
    }

    @Test
    void updateFramework_DuplicateName() {
        Framework existingFramework = new Framework();
        existingFramework.setId(1L);
        existingFramework.setName("Old Framework");

        Framework updatedFramework = new Framework();
        updatedFramework.setName("Existing Framework");

        when(frameworkRepository.findById(1L)).thenReturn(Optional.of(existingFramework));
        when(frameworkRepository.findByName("Existing Framework")).thenReturn(Optional.of(new Framework()));

        ResponseEntity<Framework> response = frameworkController.updateFramework(1L, updatedFramework);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void deleteFramework_Success() {
        when(frameworkRepository.findById(1L)).thenReturn(Optional.of(testFramework));
        doNothing().when(frameworkRepository).deleteById(1L);

        ResponseEntity<Void> response = frameworkController.deleteFramework(1L);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(frameworkRepository).deleteById(1L);
    }

    @Test
    void deleteFramework_NotFound() {
        when(frameworkRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Void> response = frameworkController.deleteFramework(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(frameworkRepository, never()).deleteById(anyLong());
    }
}
