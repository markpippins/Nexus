package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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

import com.aibizarchitect.nexus.v1.spring.serviceregistry.controller.RegistryController;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Service;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.ServiceRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.service.ExternalServiceRegistrationService;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.service.ServiceStatusCacheService;
import com.aibizarchitect.nexus.v1.dto.ExternalServiceRegistration;
import com.aibizarchitect.nexus.v1.dto.HeartbeatPayload;

@ExtendWith(MockitoExtension.class)
class RegistryControllerTest {

    @Mock
    private ExternalServiceRegistrationService registrationService;

    @Mock
    private ServiceStatusCacheService cacheService;

    @Mock
    private ServiceRepository serviceRepository;

    @InjectMocks
    private RegistryController registryController;

    private Service testService;
    private ExternalServiceRegistration testRegistration;

    @BeforeEach
    void setUp() {
        testService = new Service();
        testService.setId(1L);
        testService.setName("test-service");

        testRegistration = new ExternalServiceRegistration();
        testRegistration.setServiceName("test-service");
        testRegistration.setFramework("microservice");
    }

    @Test
    void register_Success() throws Exception {
        when(registrationService.registerExternalService(any(ExternalServiceRegistration.class)))
                .thenReturn(testService);

        ResponseEntity<Map<String, Object>> response = registryController.register(testRegistration);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue((Boolean) response.getBody().get("success"));
        assertEquals("test-service", response.getBody().get("serviceName"));
        verify(registrationService).registerExternalService(any(ExternalServiceRegistration.class));
    }

    @Test
    void register_Failure() throws Exception {
        when(registrationService.registerExternalService(any(ExternalServiceRegistration.class)))
                .thenThrow(new RuntimeException("Registration failed"));

        ResponseEntity<Map<String, Object>> response = registryController.register(testRegistration);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertFalse((Boolean) response.getBody().get("success"));
    }

    @Test
    void heartbeat_Success() {
        when(registrationService.updateHeartbeat("test-service")).thenReturn(true);

        ResponseEntity<Map<String, String>> response = registryController.heartbeat("test-service", null);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("Heartbeat received", response.getBody().get("message"));
        verify(registrationService).updateHeartbeat("test-service");
    }

    @Test
    void heartbeat_NotFound() {
        when(registrationService.updateHeartbeat("test-service")).thenReturn(false);

        ResponseEntity<Map<String, String>> response = registryController.heartbeat("test-service", null);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void heartbeat_WithCacheUpdate() {
        when(registrationService.updateHeartbeat("test-service")).thenReturn(true);
        when(serviceRepository.findByName("test-service")).thenReturn(Optional.of(testService));
        doNothing().when(cacheService).recordHeartbeat(anyString(), anyLong());

        ResponseEntity<Map<String, String>> response = registryController.heartbeat("test-service", null);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(cacheService).recordHeartbeat("test-service", 1L);
    }

    @Test
    void getAllRegisteredServices() {
        List<Service> services = List.of(testService);
        when(registrationService.getAllActiveServices()).thenReturn(services);

        ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<Service>> response = registryController.getAllRegisteredServices(PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        verify(registrationService).getAllActiveServices();
    }

    @Test
    void getAllServicesWithHosted() {
        List<Map<String, Object>> servicesWithHosted = List.of(Map.of("serviceName", "test-service"));
        when(registrationService.getAllServicesWithHosted()).thenReturn(servicesWithHosted);

        ResponseEntity<com.aibizarchitect.nexus.v1.dto.PagedResponse<Map<String, Object>>> response = registryController.getAllServicesWithHosted(PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        verify(registrationService).getAllServicesWithHosted();
    }

    @Test
    void getHostedServices_Found() {
        List<Map<String, Object>> hostedServices = List.of(Map.of("serviceName", "hosted-service"));
        when(registrationService.getHostedServicesForService("test-service"))
                .thenReturn(Optional.of(hostedServices));

        ResponseEntity<List<Map<String, Object>>> response = registryController.getHostedServices("test-service");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals(1, response.getBody().size());
    }

    @Test
    void getHostedServices_NotFound() {
        when(registrationService.getHostedServicesForService("test-service"))
                .thenReturn(Optional.empty());

        ResponseEntity<List<Map<String, Object>>> response = registryController.getHostedServices("test-service");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void findServiceByOperation_Found() {
        when(registrationService.findServiceByOperation("test.operation"))
                .thenReturn(Optional.of(testService));

        ResponseEntity<Service> response = registryController.findServiceByOperation("test.operation");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testService, response.getBody());
    }

    @Test
    void findServiceByOperation_NotFound() {
        when(registrationService.findServiceByOperation("test.operation"))
                .thenReturn(Optional.empty());

        ResponseEntity<Service> response = registryController.findServiceByOperation("test.operation");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void getServiceDetails_Found() {
        Map<String, Object> details = Map.of("serviceName", "test-service", "url", "http://localhost:8080");
        when(registrationService.getServiceDetails("test-service")).thenReturn(Optional.of(details));

        ResponseEntity<Map<String, Object>> response = registryController.getServiceDetails("test-service");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(details, response.getBody());
    }

    @Test
    void getServiceDetails_NotFound() {
        when(registrationService.getServiceDetails("test-service")).thenReturn(Optional.empty());

        ResponseEntity<Map<String, Object>> response = registryController.getServiceDetails("test-service");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void deregister_Success() {
        when(registrationService.deregisterService("test-service")).thenReturn(true);

        ResponseEntity<Map<String, String>> response = registryController.deregister("test-service");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("Service deregistered successfully", response.getBody().get("message"));
    }

    @Test
    void deregister_NotFound() {
        when(registrationService.deregisterService("test-service")).thenReturn(false);

        ResponseEntity<Map<String, String>> response = registryController.deregister("test-service");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    // ================================================================
    // ORANGE PATH — expected, handled failure
    // ================================================================

    @Test
    void register_NullServiceName_handled() {
        ExternalServiceRegistration reg = new ExternalServiceRegistration();
        reg.setServiceName(null);
        when(registrationService.registerExternalService(any(ExternalServiceRegistration.class)))
                .thenThrow(new IllegalArgumentException("serviceName required"));

        ResponseEntity<Map<String, Object>> response = registryController.register(reg);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertFalse((Boolean) response.getBody().get("success"));
    }

    @Test
    void heartbeat_BlankServiceName_returnsNotFound() {
        when(registrationService.updateHeartbeat(" ")).thenReturn(false);

        ResponseEntity<Map<String, String>> response = registryController.heartbeat(" ", null);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void deregister_BlankServiceName_handled() {
        when(registrationService.deregisterService("")).thenReturn(false);

        ResponseEntity<Map<String, String>> response = registryController.deregister("");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void maintenanceMode_InvalidTargetState_returns400() {
        ResponseEntity<Map<String, String>> response = registryController.setMaintenanceMode(
                "test-service", Map.of("targetState", "BROKEN", "reason", "test"));

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("targetState must be OFFLINE or DEGRADED", response.getBody().get("error"));
    }

    @Test
    void batchHeartbeat_EmptyServices_returns400() {
        RegistryController.BatchHeartbeatRequest req = new RegistryController.BatchHeartbeatRequest();
        req.setServices(java.util.Collections.emptyList());

        ResponseEntity<Map<String, Object>> response = registryController.batchHeartbeat(req);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("Empty services list", response.getBody().get("error"));
    }

    @Test
    void batchHeartbeat_NullServices_returns400() {
        RegistryController.BatchHeartbeatRequest req = new RegistryController.BatchHeartbeatRequest();

        ResponseEntity<Map<String, Object>> response = registryController.batchHeartbeat(req);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    // ================================================================
    // RED PATH — adversarial input the system must survive
    // ================================================================

    @Test
    void heartbeat_SpecialCharactersInServiceName_handled() {
        when(registrationService.updateHeartbeat("test<script>alert(1)</script>"))
                .thenReturn(false);

        ResponseEntity<Map<String, String>> response = registryController.heartbeat(
                "test<script>alert(1)</script>", null);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void deregister_SqlInjectionInServiceName_handled() {
        String maliciousName = "'; DROP TABLE services; --";
        when(registrationService.deregisterService(maliciousName)).thenReturn(false);

        ResponseEntity<Map<String, String>> response = registryController.deregister(maliciousName);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void findServiceByOperation_PathTraversal_handled() {
        when(registrationService.findServiceByOperation("../../../etc/passwd"))
                .thenReturn(Optional.empty());

        ResponseEntity<Service> response = registryController.findServiceByOperation("../../../etc/passwd");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    // ================================================================
    // SILENT FAILURE — metamorphic/determinism coverage
    // ================================================================

    @Test
    void metamorphic_heartbeatFailure_consistentNotFoundBody() {
        when(registrationService.updateHeartbeat("unknown-svc")).thenReturn(false);

        ResponseEntity<Map<String, String>> response1 = registryController.heartbeat("unknown-svc", null);
        ResponseEntity<Map<String, String>> response2 = registryController.heartbeat("unknown-svc", null);

        assertEquals(HttpStatus.NOT_FOUND, response1.getStatusCode());
        assertEquals(response1.getStatusCode(), response2.getStatusCode());
        // GAP: notFound has no body — regression lock
        assertNotNull(response1);
    }

    @Test
    void metamorphic_registerSuccess_producesDeterministicResponse() {
        when(registrationService.registerExternalService(any(ExternalServiceRegistration.class)))
                .thenReturn(testService);

        ResponseEntity<Map<String, Object>> response1 = registryController.register(testRegistration);
        ResponseEntity<Map<String, Object>> response2 = registryController.register(testRegistration);

        assertEquals(response1.getBody().get("success"), response2.getBody().get("success"));
        assertEquals(response1.getBody().get("serviceName"), response2.getBody().get("serviceName"));
    }

    @Test
    void regressionLock_deregisterSuccess_responseFormat() {
        when(registrationService.deregisterService("test-service")).thenReturn(true);

        ResponseEntity<Map<String, String>> response = registryController.deregister("test-service");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().containsKey("message"));
        assertEquals("Service deregistered successfully", response.getBody().get("message"));
    }
}
