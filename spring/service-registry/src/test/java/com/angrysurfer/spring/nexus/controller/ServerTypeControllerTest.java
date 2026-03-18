package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.ServerType;
import com.angrysurfer.spring.nexus.repository.ServerTypeRepository;
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
class ServerTypeControllerTest {

    @Mock
    private ServerTypeRepository repository;

    @InjectMocks
    private ServerTypeController controller;

    private ServerType testServerType;

    @BeforeEach
    void setUp() {
        org.springframework.mock.web.MockHttpServletRequest request = new org.springframework.mock.web.MockHttpServletRequest();
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
        testServerType = new ServerType();
        testServerType.setId(1L);
        testServerType.setName("Docker Container");
        testServerType.setDescription("Docker containerized server");
    }

    @Test
    void getAll() {
        Page<ServerType> page = new PageImpl<>(List.of(testServerType));
        when(repository.findAll(any(Pageable.class))).thenReturn(page);

        org.springframework.data.domain.Page<ServerType> result = controller.getAll(PageRequest.of(0, 10));

        assertEquals(1, result.getContent().size());
        verify(repository).findAll(any(Pageable.class));
    }

    @Test
    void getById_Found() {
        when(repository.findById(1L)).thenReturn(Optional.of(testServerType));

        ResponseEntity<ServerType> response = controller.getById(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testServerType, response.getBody());
    }

    @Test
    void getById_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<ServerType> response = controller.getById(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void create_Success() {
        when(repository.save(any(ServerType.class))).thenReturn(testServerType);

        ResponseEntity<ServerType> response = controller.create(testServerType);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        verify(repository).save(any(ServerType.class));
    }

    @Test
    void update_Success() {
        ServerType existing = new ServerType();
        existing.setId(1L);
        existing.setName("Old Type");

        ServerType details = new ServerType();
        details.setName("New Type");

        when(repository.findById(1L)).thenReturn(Optional.of(existing));
        when(repository.save(any(ServerType.class))).thenReturn(existing);

        ResponseEntity<ServerType> response = controller.update(1L, details);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(repository).save(any(ServerType.class));
    }

    @Test
    void update_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<ServerType> response = controller.update(1L, testServerType);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void delete_Success() {
        when(repository.findById(1L)).thenReturn(Optional.of(testServerType));
        doNothing().when(repository).delete(any(ServerType.class));

        ResponseEntity<Void> response = controller.delete(1L);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(repository).delete(any(ServerType.class));
    }

    @Test
    void delete_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Void> response = controller.delete(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }
}
