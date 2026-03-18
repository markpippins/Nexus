package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.ServiceLibrary;
import com.angrysurfer.spring.nexus.repository.ServiceLibraryRepository;
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
class ServiceLibraryControllerTest {

    @Mock
    private ServiceLibraryRepository repository;

    @InjectMocks
    private ServiceLibraryController controller;

    private ServiceLibrary testServiceLibrary;

    @BeforeEach
    void setUp() {
        org.springframework.mock.web.MockHttpServletRequest request = new org.springframework.mock.web.MockHttpServletRequest();
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
        testServiceLibrary = new ServiceLibrary();
        testServiceLibrary.setId(1L);
        testServiceLibrary.setServiceId(1L);
        testServiceLibrary.setLibraryId(1L);
        testServiceLibrary.setIsDirect(true);
        testServiceLibrary.setActiveFlag(true);
    }

    @Test
    void getServiceLibraries_ByServiceId() {
        Page<ServiceLibrary> page = new PageImpl<>(List.of(testServiceLibrary));
        when(repository.findByServiceId(eq(1L), any(Pageable.class))).thenReturn(page);

        ResponseEntity<?> response = controller.getServiceLibraries(1L, null, null, null, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(repository).findByServiceId(eq(1L), any(Pageable.class));
    }

    @Test
    void getServiceLibraries_ByServiceId_Direct() {
        Page<ServiceLibrary> page = new PageImpl<>(List.of(testServiceLibrary));
        when(repository.findByServiceIdAndIsDirect(eq(1L), eq(true), any(Pageable.class))).thenReturn(page);

        ResponseEntity<?> response = controller.getServiceLibraries(1L, null, true, null, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(repository).findByServiceIdAndIsDirect(eq(1L), eq(true), any(Pageable.class));
    }

    @Test
    void getServiceLibraries_ByServiceId_Dev() {
        Page<ServiceLibrary> page = new PageImpl<>(List.of(testServiceLibrary));
        when(repository.findByServiceIdAndIsDevDependency(eq(1L), eq(true), any(Pageable.class))).thenReturn(page);

        ResponseEntity<?> response = controller.getServiceLibraries(1L, null, null, true, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(repository).findByServiceIdAndIsDevDependency(eq(1L), eq(true), any(Pageable.class));
    }

    @Test
    void getServiceLibraries_ByLibraryId() {
        Page<ServiceLibrary> page = new PageImpl<>(List.of(testServiceLibrary));
        when(repository.findByLibraryId(eq(1L), any(Pageable.class))).thenReturn(page);

        ResponseEntity<?> response = controller.getServiceLibraries(null, 1L, null, null, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(repository).findByLibraryId(eq(1L), any(Pageable.class));
    }

    @Test
    void getServiceLibraries_All() {
        Page<ServiceLibrary> page = new PageImpl<>(List.of(testServiceLibrary));
        when(repository.findAll(any(Pageable.class))).thenReturn(page);

        ResponseEntity<?> response = controller.getServiceLibraries(null, null, null, null, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(repository).findAll(any(Pageable.class));
    }

    @Test
    void getServiceLibraryById_Found() {
        when(repository.findById(1L)).thenReturn(Optional.of(testServiceLibrary));

        ResponseEntity<ServiceLibrary> response = controller.getServiceLibraryById(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testServiceLibrary, response.getBody());
    }

    @Test
    void getServiceLibraryById_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<ServiceLibrary> response = controller.getServiceLibraryById(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void createServiceLibrary_Success() {
        when(repository.findByServiceIdAndLibraryId(1L, 1L)).thenReturn(Optional.empty());
        when(repository.save(any(ServiceLibrary.class))).thenReturn(testServiceLibrary);

        ResponseEntity<ServiceLibrary> response = controller.createServiceLibrary(testServiceLibrary);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertTrue(response.getBody().getActiveFlag());
        verify(repository).save(any(ServiceLibrary.class));
    }

    @Test
    void createServiceLibrary_Duplicate() {
        when(repository.findByServiceIdAndLibraryId(1L, 1L)).thenReturn(Optional.of(testServiceLibrary));

        ResponseEntity<ServiceLibrary> response = controller.createServiceLibrary(testServiceLibrary);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verify(repository, never()).save(any(ServiceLibrary.class));
    }

    @Test
    void updateServiceLibrary_Success() {
        when(repository.findById(1L)).thenReturn(Optional.of(testServiceLibrary));
        when(repository.save(any(ServiceLibrary.class))).thenReturn(testServiceLibrary);

        ResponseEntity<ServiceLibrary> response = controller.updateServiceLibrary(1L, testServiceLibrary);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(repository).save(any(ServiceLibrary.class));
    }

    @Test
    void updateServiceLibrary_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<ServiceLibrary> response = controller.updateServiceLibrary(1L, testServiceLibrary);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void deleteServiceLibrary_Success() {
        when(repository.findById(1L)).thenReturn(Optional.of(testServiceLibrary));
        doNothing().when(repository).deleteById(1L);

        ResponseEntity<Void> response = controller.deleteServiceLibrary(1L);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(repository).deleteById(1L);
    }

    @Test
    void deleteServiceLibrary_NotFound() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Void> response = controller.deleteServiceLibrary(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void deleteServiceLibraryByServiceAndLibrary_Found() {
        when(repository.findByServiceIdAndLibraryId(1L, 1L)).thenReturn(Optional.of(testServiceLibrary));
        doNothing().when(repository).delete(any(ServiceLibrary.class));

        ResponseEntity<Void> response = controller.deleteServiceLibraryByServiceAndLibrary(1L, 1L);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(repository).delete(any(ServiceLibrary.class));
    }

    @Test
    void deleteServiceLibraryByServiceAndLibrary_NotFound() {
        when(repository.findByServiceIdAndLibraryId(1L, 1L)).thenReturn(Optional.empty());

        ResponseEntity<Void> response = controller.deleteServiceLibraryByServiceAndLibrary(1L, 1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }
}
