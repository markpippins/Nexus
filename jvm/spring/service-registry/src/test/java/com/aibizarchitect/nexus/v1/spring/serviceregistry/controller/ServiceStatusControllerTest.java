package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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

import com.aibizarchitect.nexus.v1.spring.serviceregistry.controller.ServiceStatusController;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.DeploymentRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.StatusEventRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.service.ServiceStatusCacheService;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.service.SseEmitterRegistry;
import com.aibizarchitect.nexus.v1.dto.ServiceStatus;
import com.aibizarchitect.nexus.v1.dto.ServiceStatus.HealthState;

@ExtendWith(MockitoExtension.class)
class ServiceStatusControllerTest {

    @Mock
    private ServiceStatusCacheService cacheService;

    @Mock
    private DeploymentRepository deploymentRepository;

    @Mock
    private StatusEventRepository statusEventRepository;

    @Mock
    private SseEmitterRegistry emitterRegistry;

    @Mock
    private com.fasterxml.jackson.databind.ObjectMapper objectMapper;

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

        ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<ServiceStatus>> response = controller
                .getAllStatuses(PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(cacheService).getAllServiceStatuses();
    }

    @Test
    void getAllStatuses_Fallback() {
        when(cacheService.getAllServiceStatuses()).thenReturn(List.of());
        when(deploymentRepository.findAll()).thenReturn(List.of());

        ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<ServiceStatus>> response = controller
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
        when(cacheService.getSnapshotStatuses()).thenReturn(List.of());

        jakarta.servlet.http.HttpServletRequest mockRequest =
                org.mockito.Mockito.mock(jakarta.servlet.http.HttpServletRequest.class);
        when(mockRequest.getHeader("Last-Event-Id")).thenReturn(null);

        org.springframework.web.servlet.mvc.method.annotation.SseEmitter emitter =
                controller.streamStatusUpdates(null, null, mockRequest);

        assertNotNull(emitter);
    }

    // ================================================================
    // ORANGE PATH — expected, handled failure
    // ================================================================

    @Test
    void getServiceStatus_NullName_returnsNotFound() {
        // GAP: controller doesn't null-check serviceName — relies on cache returning empty
        when(cacheService.getServiceStatus(null)).thenReturn(Optional.empty());

        ResponseEntity<ServiceStatus> response = controller.getServiceStatus(null);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void getLastHeartbeat_BlankName_returnsNotFound() {
        when(cacheService.getLastHeartbeat("")).thenReturn(Optional.empty());

        ResponseEntity<Map<String, Object>> response = controller.getLastHeartbeat("");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void postServiceMetrics_NullBody_handled() {
        doNothing().when(cacheService).storeMetrics(eq("test-service"), eq(null));

        ResponseEntity<Map<String, String>> response = controller.postServiceMetrics("test-service", null);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        // GAP: should this really accept null metrics? Documented for awareness
    }

    @Test
    void getServiceMetrics_EmptyName_returnsNotFound() {
        when(cacheService.getMetrics("")).thenReturn(Optional.empty());

        ResponseEntity<Map<String, Object>> response = controller.getServiceMetrics("");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    // ================================================================
    // RED PATH — adversarial input the system must survive
    // ================================================================

    @Test
    void postServiceMetrics_SpecialCharServiceName_handled() {
        String maliciousName = "test<script>alert(1)</script>";
        doNothing().when(cacheService).storeMetrics(eq(maliciousName), anyMap());

        ResponseEntity<Map<String, String>> response = controller.postServiceMetrics(
                maliciousName, Map.of("cpu", "10%"));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(cacheService).storeMetrics(eq(maliciousName), anyMap());
    }

    @Test
    void postServiceMetrics_ExtremelyLargeBody_handled() {
        java.util.Map<String, Object> largeMetrics = new java.util.HashMap<>();
        for (int i = 0; i < 1000; i++) {
            largeMetrics.put("key" + i, "value".repeat(100));
        }
        doNothing().when(cacheService).storeMetrics(eq("test-service"), eq(largeMetrics));

        ResponseEntity<Map<String, String>> response = controller.postServiceMetrics("test-service", largeMetrics);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    // ================================================================
    // SILENT FAILURE — metamorphic/determinism coverage
    // ================================================================

    @Test
    void metamorphic_redisHealth_sameStateConsistentOutput() {
        when(cacheService.isRedisHealthy()).thenReturn(true);

        ResponseEntity<Map<String, Object>> response1 = controller.getRedisHealth();
        ResponseEntity<Map<String, Object>> response2 = controller.getRedisHealth();

        assertEquals(response1.getBody().get("redisAvailable"), response2.getBody().get("redisAvailable"));
    }

    @Test
    void metamorphic_healthyVsUnhealthy_producesDifferentOutput() {
        when(cacheService.isRedisHealthy()).thenReturn(true);
        ResponseEntity<Map<String, Object>> healthy = controller.getRedisHealth();

        when(cacheService.isRedisHealthy()).thenReturn(false);
        ResponseEntity<Map<String, Object>> unhealthy = controller.getRedisHealth();

        assertNotEquals(healthy.getBody().get("redisAvailable"), unhealthy.getBody().get("redisAvailable"),
                "Healthy and unhealthy Redis states MUST differ");
    }

    @Test
    void regressionLock_heartbeatResponse_hasRequiredFields() {
        Instant now = Instant.now();
        when(cacheService.getLastHeartbeat("test-service")).thenReturn(Optional.of(now));
        when(cacheService.isServiceStale("test-service")).thenReturn(false);

        ResponseEntity<Map<String, Object>> response = controller.getLastHeartbeat("test-service");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().containsKey("serviceName"), "lastHeartbeat MUST include serviceName");
        assertTrue(response.getBody().containsKey("isStale"), "lastHeartbeat MUST include isStale");
    }
}
