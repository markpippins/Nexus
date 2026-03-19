package com.angrysurfer.spring.nexus.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import com.angrysurfer.nexus.dto.ServiceStatus;
import com.angrysurfer.nexus.dto.ServiceStatus.HealthState;
import com.angrysurfer.spring.nexus.repository.DeploymentRepository;
import com.angrysurfer.spring.nexus.service.ServiceStatusCacheService;

@ExtendWith(MockitoExtension.class)
class ServiceStatusControllerTest {

    @Mock
    private ServiceStatusCacheService cacheService;

    @Mock
    private DeploymentRepository deploymentRepository;

    @InjectMocks
    private ServiceStatusController controller;

    private ServiceStatus testStatus;

    @BeforeEach
    void setUp() {
        testStatus = ServiceStatus.builder()
                .serviceId(1L)
                .serviceName("test-service")
                .healthState(HealthState.HEALTHY)
                .lastHealthCheck(Instant.now())
                .build();
    }

    @Test
    void getAllStatuses_WithCache() {
        List<ServiceStatus> statuses = List.of(testStatus);
        when(cacheService.getAllServiceStatuses()).thenReturn(statuses);

        ResponseEntity<com.angrysurfer.nexus.dto.PagedResponse<ServiceStatus>> response = controller
                .getAllStatuses(PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(cacheService).getAllServiceStatuses();
    }

    @Test
    void getAllStatuses_Fallback() {
        when(cacheService.getAllServiceStatuses()).thenReturn(List.of());
        when(deploymentRepository.findAll()).thenReturn(List.of());

        ResponseEntity<com.angrysurfer.nexus.dto.PagedResponse<ServiceStatus>> response = controller
                .getAllStatuses(PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(deploymentRepository).findAll();
    }

    @Test
    void getServiceStatus_Found() {
        when(cacheService.getServiceStatus("test-service")).thenReturn(Optional.of(testStatus));

        ResponseEntity<ServiceStatus> response = controller.getServiceStatus("test-service");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testStatus, response.getBody());
    }

    @Test
    void getServiceStatus_NotFound() {
        when(cacheService.getServiceStatus("test-service")).thenReturn(Optional.empty());

        ResponseEntity<ServiceStatus> response = controller.getServiceStatus("test-service");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void getLastHeartbeat_Found() {
        Instant now = Instant.now();
        when(cacheService.getLastHeartbeat("test-service")).thenReturn(Optional.of(now));
        when(cacheService.isServiceStale("test-service")).thenReturn(false);

        ResponseEntity<Map<String, Object>> response = controller.getLastHeartbeat("test-service");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("test-service", response.getBody().get("serviceName"));
    }

    @Test
    void getLastHeartbeat_NotFound() {
        when(cacheService.getLastHeartbeat("test-service")).thenReturn(Optional.empty());

        ResponseEntity<Map<String, Object>> response = controller.getLastHeartbeat("test-service");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void getServiceMetrics_Found() {
        Map<String, Object> metrics = Map.of("cpu", "10%");
        when(cacheService.getMetrics("test-service")).thenReturn(Optional.of(metrics));

        ResponseEntity<Map<String, Object>> response = controller.getServiceMetrics("test-service");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(metrics, response.getBody());
    }

    @Test
    void getServiceMetrics_NotFound() {
        when(cacheService.getMetrics("test-service")).thenReturn(Optional.empty());

        ResponseEntity<Map<String, Object>> response = controller.getServiceMetrics("test-service");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void postServiceMetrics() {
        Map<String, Object> metrics = Map.of("cpu", "10%");
        doNothing().when(cacheService).storeMetrics("test-service", metrics);

        ResponseEntity<Map<String, String>> response = controller.postServiceMetrics("test-service", metrics);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(cacheService).storeMetrics("test-service", metrics);
    }

    @Test
    void getRedisHealth_Healthy() {
        when(cacheService.isRedisHealthy()).thenReturn(true);

        ResponseEntity<Map<String, Object>> response = controller.getRedisHealth();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue((Boolean) response.getBody().get("redisAvailable"));
    }

    @Test
    void getRedisHealth_Unhealthy() {
        when(cacheService.isRedisHealthy()).thenReturn(false);

        ResponseEntity<Map<String, Object>> response = controller.getRedisHealth();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertFalse((Boolean) response.getBody().get("redisAvailable"));
    }

    @Test
    void streamStatusUpdates() {
        org.springframework.web.servlet.mvc.method.annotation.SseEmitter emitter = controller.streamStatusUpdates();

        assertNotNull(emitter);
    }
}
