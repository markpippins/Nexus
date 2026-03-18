package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.VisualComponent;
import com.angrysurfer.spring.nexus.repository.VisualComponentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class VisualComponentControllerTest {

    @Mock
    private VisualComponentRepository repository;

    @InjectMocks
    private VisualComponentController controller;

    private VisualComponent testComponent;

    @BeforeEach
    void setUp() {
        testComponent = new VisualComponent();
        testComponent.setId(1L);
        testComponent.setType("service-node");
        testComponent.setName("Service Node");
        testComponent.setDefaultColor(16711680L); // #FF0000 as Long
        testComponent.setIsSystem(false);
    }

    @Test
    void getAll() {
        when(repository.findAll()).thenReturn(List.of(testComponent));

        List<VisualComponent> result = controller.getAll();

        assertEquals(1, result.size());
        verify(repository).findAll();
    }

    @Test
    void getById_Found() {
        when(repository.findById(1L)).thenReturn(Optional.of(testComponent));

        ResponseEntity<VisualComponent> response = controller.getById(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testComponent, response.getBody());
    }

    @Test
    void getById_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<VisualComponent> response = controller.getById(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void create_Success() {
        when(repository.save(any(VisualComponent.class))).thenReturn(testComponent);

        VisualComponent result = controller.create(testComponent);

        assertNotNull(result);
        assertEquals(testComponent, result);
        verify(repository).save(any(VisualComponent.class));
    }

    @Test
    void update_Success() {
        VisualComponent existing = new VisualComponent();
        existing.setId(1L);
        existing.setName("Old Component");
        existing.setIsSystem(false);

        VisualComponent details = new VisualComponent();
        details.setName("New Component");

        when(repository.findById(1L)).thenReturn(Optional.of(existing));
        when(repository.save(any(VisualComponent.class))).thenReturn(existing);

        ResponseEntity<VisualComponent> response = controller.update(1L, details);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(repository).save(any(VisualComponent.class));
    }

    @Test
    void update_SystemComponent_Forbidden() {
        VisualComponent existing = new VisualComponent();
        existing.setId(1L);
        existing.setName("System Component");
        existing.setIsSystem(true);

        VisualComponent details = new VisualComponent();
        details.setName("Modified Component");

        when(repository.findById(1L)).thenReturn(Optional.of(existing));

        ResponseEntity<VisualComponent> response = controller.update(1L, details);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        verify(repository, never()).save(any(VisualComponent.class));
    }

    @Test
    void update_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<VisualComponent> response = controller.update(1L, testComponent);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void delete_Success() {
        VisualComponent existing = new VisualComponent();
        existing.setId(1L);
        existing.setIsSystem(false);

        when(repository.findById(1L)).thenReturn(Optional.of(existing));
        doNothing().when(repository).delete(any(VisualComponent.class));

        ResponseEntity<Void> response = controller.delete(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(repository).delete(any(VisualComponent.class));
    }

    @Test
    void delete_SystemComponent_Forbidden() {
        VisualComponent existing = new VisualComponent();
        existing.setId(1L);
        existing.setIsSystem(true);

        when(repository.findById(1L)).thenReturn(Optional.of(existing));

        ResponseEntity<Void> response = controller.delete(1L);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        verify(repository, never()).delete(any(VisualComponent.class));
    }

    @Test
    void delete_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Void> response = controller.delete(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }
}
