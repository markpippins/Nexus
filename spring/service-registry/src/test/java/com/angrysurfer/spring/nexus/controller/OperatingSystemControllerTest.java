package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.OperatingSystem;
import com.angrysurfer.spring.nexus.repository.OperatingSystemRepository;
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
class OperatingSystemControllerTest {

    @Mock
    private OperatingSystemRepository repository;

    @InjectMocks
    private OperatingSystemController controller;

    private OperatingSystem testOS;

    @BeforeEach
    void setUp() {
        org.springframework.mock.web.MockHttpServletRequest request = new org.springframework.mock.web.MockHttpServletRequest();
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
        testOS = new OperatingSystem();
        testOS.setId(1L);
        testOS.setName("Ubuntu");
        testOS.setVersion("22.04");
        testOS.setLtsFlag(true);
        testOS.setActiveFlag(true);
    }

    @Test
    void getAll() {
        Page<OperatingSystem> page = new PageImpl<>(List.of(testOS));
        when(repository.findAll(any(Pageable.class))).thenReturn(page);

        org.springframework.data.domain.Page<OperatingSystem> result = controller.getAll(PageRequest.of(0, 10));

        assertEquals(1, result.getContent().size());
        verify(repository).findAll(any(Pageable.class));
    }

    @Test
    void getById_Found() {
        when(repository.findById(1L)).thenReturn(Optional.of(testOS));

        ResponseEntity<OperatingSystem> response = controller.getById(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testOS, response.getBody());
    }

    @Test
    void getById_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<OperatingSystem> response = controller.getById(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void create_Success() {
        when(repository.save(any(OperatingSystem.class))).thenReturn(testOS);

        ResponseEntity<OperatingSystem> response = controller.create(testOS);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        verify(repository).save(any(OperatingSystem.class));
    }

    @Test
    void update_Success() {
        OperatingSystem existing = new OperatingSystem();
        existing.setId(1L);
        existing.setName("Old OS");

        OperatingSystem details = new OperatingSystem();
        details.setName("New OS");

        when(repository.findById(1L)).thenReturn(Optional.of(existing));
        when(repository.save(any(OperatingSystem.class))).thenReturn(existing);

        ResponseEntity<OperatingSystem> response = controller.update(1L, details);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(repository).save(any(OperatingSystem.class));
    }

    @Test
    void update_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<OperatingSystem> response = controller.update(1L, testOS);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void delete_Success() {
        when(repository.findById(1L)).thenReturn(Optional.of(testOS));
        doNothing().when(repository).delete(any(OperatingSystem.class));

        ResponseEntity<Void> response = controller.delete(1L);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(repository).delete(any(OperatingSystem.class));
    }

    @Test
    void delete_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Void> response = controller.delete(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }
}
