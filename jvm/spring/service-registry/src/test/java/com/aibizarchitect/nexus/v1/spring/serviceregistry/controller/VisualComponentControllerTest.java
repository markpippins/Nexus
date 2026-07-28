package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.controller.VisualComponentController;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.VisualComponent;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.VisualComponentRepository;

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
        org.springframework.data.domain.Page<VisualComponent> page = new org.springframework.data.domain.PageImpl<>(List.of(testComponent));
        when(repository.findAll(any(org.springframework.data.domain.Pageable.class))).thenReturn(page);

        ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<VisualComponent>> result = controller.getAll(org.springframework.data.domain.PageRequest.of(0, 10));

        assertNotNull(result.getBody());
        verify(repository).findAll(any(org.springframework.data.domain.Pageable.class));
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

    // ================================================================
    // ORANGE PATH — expected, handled failure
    // ================================================================

    @Test
    void create_NullType_handled() {
        VisualComponent comp = new VisualComponent();
        comp.setName("No Type Component");
        comp.setType(null);
        when(repository.save(any(VisualComponent.class))).thenReturn(comp);

        VisualComponent result = controller.create(comp);

        assertNotNull(result);
        // GAP: no validation on null type — entity accepts it
    }

    @Test
    void update_SystemComponent_NullDetails_doesNotCorrupt() {
        VisualComponent existing = new VisualComponent();
        existing.setId(1L);
        existing.setName("System Component");
        existing.setIsSystem(true);

        when(repository.findById(1L)).thenReturn(Optional.of(existing));

        ResponseEntity<VisualComponent> response = controller.update(1L, new VisualComponent());

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        verify(repository, never()).save(any(VisualComponent.class));
    }

    @Test
    void delete_SystemComponent_NullEntity_returnsForbidden() {
        VisualComponent existing = new VisualComponent();
        existing.setId(1L);
        existing.setIsSystem(true);

        when(repository.findById(1L)).thenReturn(Optional.of(existing));

        ResponseEntity<Void> response = controller.delete(1L);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        verify(repository, never()).delete(any(VisualComponent.class));
    }

    // ================================================================
    // RED PATH — adversarial input the system must survive
    // ================================================================

    @Test
    void create_SystemFlagInjection_handled() {
        VisualComponent comp = new VisualComponent();
        comp.setName("Fake System");
        comp.setType("service-node");
        comp.setIsSystem(true);
        when(repository.save(any(VisualComponent.class))).thenReturn(comp);

        VisualComponent result = controller.create(comp);

        assertNotNull(result);
        // GAP: create() doesn't reject isSystem=true — system components can be created via API
    }

    @Test
    void getById_NegativeId_returnsNotFound() {
        when(repository.findById(-1L)).thenReturn(Optional.empty());

        ResponseEntity<VisualComponent> response = controller.getById(-1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    // ================================================================
    // SILENT FAILURE — metamorphic/determinism coverage
    // ================================================================

    @Test
    void metamorphic_getByIdSameInput_producesSameOutput() {
        when(repository.findById(1L)).thenReturn(Optional.of(testComponent));

        ResponseEntity<VisualComponent> response1 = controller.getById(1L);
        ResponseEntity<VisualComponent> response2 = controller.getById(1L);

        assertEquals(response1.getBody().getId(), response2.getBody().getId());
        assertEquals(response1.getBody().getName(), response2.getBody().getName());
    }

    @Test
    void metamorphic_systemVsUserComponent_differentUpdateBehavior() {
        VisualComponent systemComp = new VisualComponent();
        systemComp.setId(1L);
        systemComp.setIsSystem(true);

        VisualComponent userComp = new VisualComponent();
        userComp.setId(2L);
        userComp.setIsSystem(false);

        when(repository.findById(1L)).thenReturn(Optional.of(systemComp));
        when(repository.findById(2L)).thenReturn(Optional.of(userComp));
        when(repository.save(any(VisualComponent.class))).thenReturn(userComp);

        ResponseEntity<VisualComponent> systemResponse = controller.update(1L, testComponent);
        ResponseEntity<VisualComponent> userResponse = controller.update(2L, testComponent);

        assertNotEquals(systemResponse.getStatusCode(), userResponse.getStatusCode(),
                "System and user components MUST have different update behavior");
    }

    @Test
    void regressionLock_systemComponentDelete_responseFormat() {
        VisualComponent existing = new VisualComponent();
        existing.setId(1L);
        existing.setIsSystem(true);

        when(repository.findById(1L)).thenReturn(Optional.of(existing));

        ResponseEntity<Void> response = controller.delete(1L);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode(),
                "System component delete MUST be forbidden — regression lock");
    }
}
