package nexus.serviceregistry.v1.controller;

import com.angrysurfer.nexus.dto.ExternalServiceRegistration;
import nexus.serviceregistry.v1.entity.Service;
import nexus.serviceregistry.v1.repository.ServiceRepository;
import nexus.serviceregistry.v1.service.ExternalServiceRegistrationService;
import nexus.serviceregistry.v1.service.ServiceStatusCacheService;
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
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

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

        ResponseEntity<Map<String, String>> response = registryController.heartbeat("test-service");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("Heartbeat received", response.getBody().get("message"));
        verify(registrationService).updateHeartbeat("test-service");
    }

    @Test
    void heartbeat_NotFound() {
        when(registrationService.updateHeartbeat("test-service")).thenReturn(false);

        ResponseEntity<Map<String, String>> response = registryController.heartbeat("test-service");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void heartbeat_WithCacheUpdate() {
        when(registrationService.updateHeartbeat("test-service")).thenReturn(true);
        when(serviceRepository.findByName("test-service")).thenReturn(Optional.of(testService));
        doNothing().when(cacheService).recordHeartbeat(anyString(), anyLong());

        ResponseEntity<Map<String, String>> response = registryController.heartbeat("test-service");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(cacheService).recordHeartbeat("test-service", 1L);
    }

    @Test
    void getAllRegisteredServices() {
        List<Service> services = List.of(testService);
        when(registrationService.getAllActiveServices()).thenReturn(services);

        ResponseEntity<com.angrysurfer.nexus.dto.PagedResponse<Service>> response = registryController.getAllRegisteredServices(PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(registrationService).getAllActiveServices();
    }

    @Test
    void getAllServicesWithHosted() {
        List<Map<String, Object>> servicesWithHosted = List.of(Map.of("serviceName", "test-service"));
        when(registrationService.getAllServicesWithHosted()).thenReturn(servicesWithHosted);

        ResponseEntity<com.angrysurfer.nexus.dto.PagedResponse<Map<String, Object>>> response = registryController.getAllServicesWithHosted(PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
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
}
