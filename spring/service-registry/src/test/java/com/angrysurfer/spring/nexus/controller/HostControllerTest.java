package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.client.ServicesConsoleClient;
import com.angrysurfer.spring.nexus.entity.Host;
import com.angrysurfer.spring.nexus.repository.HostRepository;
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
class HostControllerTest {

    @Mock
    private ServicesConsoleClient client;

    @Mock
    private HostRepository hostRepository;

    @InjectMocks
    private HostController hostController;

    private Host testHost;

    @BeforeEach
    void setUp() {
        org.springframework.mock.web.MockHttpServletRequest request = new org.springframework.mock.web.MockHttpServletRequest();
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
        testHost = new Host();
        testHost.setId(1L);
        testHost.setHostname("test-server");
        testHost.setIpAddress("192.168.1.100");
        testHost.setActiveFlag(true);
    }

    @Test
    void getServers_ByHostname_Found() {
        when(hostRepository.findByHostname("test-server")).thenReturn(Optional.of(testHost));

        ResponseEntity<?> response = hostController.getServers("test-server", PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testHost, response.getBody());
        verify(hostRepository).findByHostname("test-server");
    }

    @Test
    void getServers_ByHostname_NotFound() {
        when(hostRepository.findByHostname("nonexistent")).thenReturn(Optional.empty());

        ResponseEntity<?> response = hostController.getServers("nonexistent", PageRequest.of(0, 10));

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void getServers_All() {
        Page<Host> hostPage = new PageImpl<>(List.of(testHost));
        when(hostRepository.findAll(any(Pageable.class))).thenReturn(hostPage);

        ResponseEntity<?> response = hostController.getServers(null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(hostRepository).findAll(any(Pageable.class));
    }

    @Test
    void getServerById_Found() {
        when(hostRepository.findById(1L)).thenReturn(Optional.of(testHost));

        ResponseEntity<Host> response = hostController.getServerById(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testHost, response.getBody());
    }

    @Test
    void getServerById_NotFound() {
        when(hostRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Host> response = hostController.getServerById(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void createServer_Success() {
        when(hostRepository.findByHostname("test-server")).thenReturn(Optional.empty());
        when(hostRepository.save(any(Host.class))).thenReturn(testHost);

        ResponseEntity<Host> response = hostController.createServer(testHost);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().getActiveFlag());
        verify(hostRepository).save(any(Host.class));
    }

    @Test
    void createServer_DuplicateHostname() {
        when(hostRepository.findByHostname("test-server")).thenReturn(Optional.of(testHost));

        ResponseEntity<Host> response = hostController.createServer(testHost);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verify(hostRepository, never()).save(any(Host.class));
    }

    @Test
    void updateServer_Success() {
        Host existingHost = new Host();
        existingHost.setId(1L);
        existingHost.setHostname("old-hostname");

        Host updatedHost = new Host();
        updatedHost.setHostname("new-hostname");

        when(hostRepository.findById(1L)).thenReturn(Optional.of(existingHost));
        when(hostRepository.findByHostname("new-hostname")).thenReturn(Optional.empty());
        when(hostRepository.save(any(Host.class))).thenReturn(updatedHost);

        ResponseEntity<Host> response = hostController.updateServer(1L, updatedHost);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(hostRepository).save(any(Host.class));
    }

    @Test
    void updateServer_NotFound() {
        when(hostRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Host> response = hostController.updateServer(1L, testHost);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(hostRepository, never()).save(any(Host.class));
    }

    @Test
    void updateServer_DuplicateHostname() {
        Host existingHost = new Host();
        existingHost.setId(1L);
        existingHost.setHostname("old-hostname");

        Host updatedHost = new Host();
        updatedHost.setHostname("existing-hostname");

        when(hostRepository.findById(1L)).thenReturn(Optional.of(existingHost));
        when(hostRepository.findByHostname("existing-hostname")).thenReturn(Optional.of(new Host()));

        ResponseEntity<Host> response = hostController.updateServer(1L, updatedHost);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void deleteServer_Success() {
        when(hostRepository.findById(1L)).thenReturn(Optional.of(testHost));
        doNothing().when(hostRepository).deleteById(1L);

        ResponseEntity<Void> response = hostController.deleteServer(1L);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(hostRepository).deleteById(1L);
    }

    @Test
    void deleteServer_NotFound() {
        when(hostRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Void> response = hostController.deleteServer(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(hostRepository, never()).deleteById(anyLong());
    }
}
