package com.aibizarchitect.nexus.v1.spring.broker.gateway.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;

import com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient;

@ExtendWith(MockitoExtension.class)
class ExternalServiceInvokerTest {

    @Mock
    private ServiceDiscoveryClient discoveryClient;

    @Mock
    private RestTemplate restTemplate;

    private ExternalServiceInvokerImpl serviceInvoker;

    @BeforeEach
    void setUp() {
        serviceInvoker = new ExternalServiceInvokerImpl(discoveryClient, restTemplate);
    }

    @Test
    void invokeOperation_WithValidServiceAndOperation_ShouldReturnSuccess() {
        // Given
        String operation = "testOperation";
        Object requestBody = new Object();
        ServiceDiscoveryClientImpl.ServiceInfoImpl serviceInfo = new ServiceDiscoveryClientImpl.ServiceInfoImpl();
        serviceInfo.setName("testService");
        ServiceDiscoveryClientImpl.ServiceDetailsImpl serviceDetails = new ServiceDiscoveryClientImpl.ServiceDetailsImpl();
        serviceDetails.setEndpoint("http://test-service:8080");

        when(discoveryClient.findServiceByOperation(operation)).thenReturn(Optional.of(serviceInfo));
        when(discoveryClient.getServiceDetails("testService")).thenReturn(Optional.of(serviceDetails));

        ResponseEntity<String> mockResponse = ResponseEntity.ok("success");
        when(restTemplate.exchange(
                anyString(),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(String.class)
        )).thenReturn(mockResponse);

        // When
        var result = serviceInvoker.invokeOperation(operation, requestBody);

        // Then
        assertTrue(result.isSuccess());
        assertEquals(200, result.getStatusCode());
        assertEquals("success", result.getBody());

        // Verify that the correct URL was called
        ArgumentCaptor<String> urlCaptor = ArgumentCaptor.forClass(String.class);
        verify(restTemplate).exchange(
                urlCaptor.capture(),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(String.class)
        );
        assertEquals("http://test-service:8080/testOperation", urlCaptor.getValue());
    }

    @Test
    void invokeOperation_WithNoServiceFound_ShouldReturnNotFound() {
        // Given
        String operation = "nonExistentOperation";
        Object requestBody = new Object();

        when(discoveryClient.findServiceByOperation(operation)).thenReturn(Optional.empty());

        // When
        var result = serviceInvoker.invokeOperation(operation, requestBody);

        // Then
        assertFalse(result.isSuccess());
        assertEquals(404, result.getStatusCode());
        verify(restTemplate, never()).exchange(anyString(), any(HttpMethod.class), any(HttpEntity.class), any(Class.class));
    }

    @Test
    void invokeOperation_WithNoServiceDetails_ShouldReturnInternalServerError() {
        // Given
        String operation = "testOperation";
        Object requestBody = new Object();
        ServiceDiscoveryClientImpl.ServiceInfoImpl serviceInfo = new ServiceDiscoveryClientImpl.ServiceInfoImpl();
        serviceInfo.setName("testService");

        when(discoveryClient.findServiceByOperation(operation)).thenReturn(Optional.of(serviceInfo));
        when(discoveryClient.getServiceDetails("testService")).thenReturn(Optional.empty());

        // When
        var result = serviceInvoker.invokeOperation(operation, requestBody);

        // Then
        assertFalse(result.isSuccess());
        assertEquals(500, result.getStatusCode());
        verify(restTemplate, never()).exchange(anyString(), any(HttpMethod.class), any(HttpEntity.class), any(Class.class));
    }

    @Test
    void invokeOperation_WithRestTemplateException_ShouldReturnInternalServerError() {
        // Given
        String operation = "testOperation";
        Object requestBody = new Object();
        ServiceDiscoveryClientImpl.ServiceInfoImpl serviceInfo = new ServiceDiscoveryClientImpl.ServiceInfoImpl();
        serviceInfo.setName("testService");
        ServiceDiscoveryClientImpl.ServiceDetailsImpl serviceDetails = new ServiceDiscoveryClientImpl.ServiceDetailsImpl();
        serviceDetails.setEndpoint("http://test-service:8080");

        when(discoveryClient.findServiceByOperation(operation)).thenReturn(Optional.of(serviceInfo));
        when(discoveryClient.getServiceDetails("testService")).thenReturn(Optional.of(serviceDetails));
        when(restTemplate.exchange(
                anyString(),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(String.class)
        )).thenThrow(new RuntimeException("Connection failed"));

        // When
        var result = serviceInvoker.invokeOperation(operation, requestBody);

        // Then
        assertFalse(result.isSuccess());
        assertEquals(500, result.getStatusCode());
        assertTrue(result.getErrorMessage().contains("Failed to invoke external service"));
    }

    @Test
    void healthCheck_WithHealthyService_ShouldReturnTrue() {
        // Given
        String serviceName = "testService";
        ServiceDiscoveryClientImpl.ServiceDetailsImpl serviceDetails = new ServiceDiscoveryClientImpl.ServiceDetailsImpl();
        serviceDetails.setEndpoint("http://test-service:8080");

        when(discoveryClient.getServiceDetails(serviceName)).thenReturn(Optional.of(serviceDetails));
        when(restTemplate.getForEntity("http://test-service:8080", String.class))
                .thenReturn(ResponseEntity.ok("healthy"));

        // When
        boolean result = serviceInvoker.healthCheck(serviceName);

        // Then
        assertTrue(result);
    }

    @Test
    void healthCheck_WithUnhealthyService_ShouldReturnFalse() {
        // Given
        String serviceName = "testService";
        ServiceDiscoveryClientImpl.ServiceDetailsImpl serviceDetails = new ServiceDiscoveryClientImpl.ServiceDetailsImpl();
        serviceDetails.setEndpoint("http://test-service:8080");

        when(discoveryClient.getServiceDetails(serviceName)).thenReturn(Optional.of(serviceDetails));
        when(restTemplate.getForEntity("http://test-service:8080", String.class))
                .thenReturn(ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build());

        // When
        boolean result = serviceInvoker.healthCheck(serviceName);

        // Then
        assertFalse(result);
    }

    @Test
    void healthCheck_WithServiceNotFoundException_ShouldReturnFalse() {
        // Given
        String serviceName = "nonExistentService";

        when(discoveryClient.getServiceDetails(serviceName)).thenReturn(Optional.empty());

        // When
        boolean result = serviceInvoker.healthCheck(serviceName);

        // Then
        assertFalse(result);
    }

    @Test
    void healthCheck_WithRestTemplateException_ShouldReturnFalse() {
        // Given
        String serviceName = "testService";
        ServiceDiscoveryClientImpl.ServiceDetailsImpl serviceDetails = new ServiceDiscoveryClientImpl.ServiceDetailsImpl();
        serviceDetails.setEndpoint("http://test-service:8080");

        when(discoveryClient.getServiceDetails(serviceName)).thenReturn(Optional.of(serviceDetails));
        when(restTemplate.getForEntity("http://test-service:8080", String.class))
                .thenThrow(new RuntimeException("Connection failed"));

        // When
        boolean result = serviceInvoker.healthCheck(serviceName);

        // Then
        assertFalse(result);
    }

    // ================================================================
    // ORANGE PATH — expected, handled failure
    // ================================================================

    @Test
    void invokeOperation_WithNullOperation_guarded() {
        var result = serviceInvoker.invokeOperation(null, new Object());

        assertFalse(result.isSuccess());
        assertEquals(404, result.getStatusCode());
        assertEquals("Operation name is required", result.getErrorMessage());
    }

    @Test
    void invokeOperation_WithBlankOperation_guarded() {
        var result = serviceInvoker.invokeOperation(" ", new Object());

        assertFalse(result.isSuccess());
        assertEquals(404, result.getStatusCode());
        assertEquals("Operation name is required", result.getErrorMessage());
    }

    @Test
    void invokeOperation_WithNullRequestBody_succeeds() {
        String operation = "testOperation";
        ServiceDiscoveryClientImpl.ServiceInfoImpl serviceInfo = new ServiceDiscoveryClientImpl.ServiceInfoImpl();
        serviceInfo.setName("testService");
        ServiceDiscoveryClientImpl.ServiceDetailsImpl serviceDetails = new ServiceDiscoveryClientImpl.ServiceDetailsImpl();
        serviceDetails.setEndpoint("http://test-service:8080");

        when(discoveryClient.findServiceByOperation(operation)).thenReturn(Optional.of(serviceInfo));
        when(discoveryClient.getServiceDetails("testService")).thenReturn(Optional.of(serviceDetails));
        when(restTemplate.exchange(anyString(), eq(HttpMethod.POST), any(HttpEntity.class), eq(String.class)))
                .thenReturn(ResponseEntity.ok("success"));

        var result = serviceInvoker.invokeOperation(operation, null);

        assertTrue(result.isSuccess());
    }

    @Test
    void healthCheck_WithNullServiceName_returnsFalse() {
        // GAP: null serviceName not guarded — relies on discoveryClient
        when(discoveryClient.getServiceDetails(null)).thenReturn(Optional.empty());

        boolean result = serviceInvoker.healthCheck(null);

        assertFalse(result);
    }

    // ================================================================
    // RED PATH — adversarial input the system must survive
    // ================================================================

    @Test
    void invokeOperation_WithXssInOperation_handled() {
        String xss = "<script>alert(1)</script>";
        when(discoveryClient.findServiceByOperation(xss)).thenReturn(Optional.empty());

        var result = serviceInvoker.invokeOperation(xss, new Object());

        assertFalse(result.isSuccess());
        assertEquals(404, result.getStatusCode());
    }

    @Test
    void invokeOperation_WithSqlInjectionInOperation_handled() {
        String sql = "'; DROP TABLE services; --";
        when(discoveryClient.findServiceByOperation(sql)).thenReturn(Optional.empty());

        var result = serviceInvoker.invokeOperation(sql, new Object());

        assertFalse(result.isSuccess());
    }

    @Test
    void invokeOperation_WithNullEndpoint_returns500() {
        String operation = "testOperation";
        ServiceDiscoveryClientImpl.ServiceInfoImpl serviceInfo = new ServiceDiscoveryClientImpl.ServiceInfoImpl();
        serviceInfo.setName("testService");
        ServiceDiscoveryClientImpl.ServiceDetailsImpl serviceDetails = new ServiceDiscoveryClientImpl.ServiceDetailsImpl();
        serviceDetails.setEndpoint(null);

        when(discoveryClient.findServiceByOperation(operation)).thenReturn(Optional.of(serviceInfo));
        when(discoveryClient.getServiceDetails("testService")).thenReturn(Optional.of(serviceDetails));

        var result = serviceInvoker.invokeOperation(operation, new Object());

        assertFalse(result.isSuccess());
        assertEquals(500, result.getStatusCode());
        assertTrue(result.getErrorMessage().contains("no endpoint configured"));
    }

    @Test
    void healthCheck_WithEndpointWithoutTrailingSlash_appendsHealthCheck() {
        String serviceName = "testService";
        ServiceDiscoveryClientImpl.ServiceDetailsImpl serviceDetails = new ServiceDiscoveryClientImpl.ServiceDetailsImpl();
        serviceDetails.setEndpoint("http://test-service:8080");
        serviceDetails.setHealthCheck("actuator/health");

        when(discoveryClient.getServiceDetails(serviceName)).thenReturn(Optional.of(serviceDetails));
        when(restTemplate.getForEntity("http://test-service:8080/actuator/health", String.class))
                .thenReturn(ResponseEntity.ok("healthy"));

        boolean result = serviceInvoker.healthCheck(serviceName);

        assertTrue(result);
    }

    @Test
    void healthCheck_WithEndpointWithTrailingSlash_appendsHealthCheck() {
        String serviceName = "testService";
        ServiceDiscoveryClientImpl.ServiceDetailsImpl serviceDetails = new ServiceDiscoveryClientImpl.ServiceDetailsImpl();
        serviceDetails.setEndpoint("http://test-service:8080/");
        serviceDetails.setHealthCheck("health");

        when(discoveryClient.getServiceDetails(serviceName)).thenReturn(Optional.of(serviceDetails));
        when(restTemplate.getForEntity("http://test-service:8080/health", String.class))
                .thenReturn(ResponseEntity.ok("healthy"));

        boolean result = serviceInvoker.healthCheck(serviceName);

        assertTrue(result);
    }

    // ================================================================
    // SILENT FAILURE — metamorphic/determinism, regression locks
    // ================================================================

    @Test
    void metamorphic_invokeOperation_sameInput_sameOutput() {
        String operation = "testOperation";
        ServiceDiscoveryClientImpl.ServiceInfoImpl serviceInfo = new ServiceDiscoveryClientImpl.ServiceInfoImpl();
        serviceInfo.setName("testService");
        ServiceDiscoveryClientImpl.ServiceDetailsImpl serviceDetails = new ServiceDiscoveryClientImpl.ServiceDetailsImpl();
        serviceDetails.setEndpoint("http://test-service:8080");

        when(discoveryClient.findServiceByOperation(operation)).thenReturn(Optional.of(serviceInfo));
        when(discoveryClient.getServiceDetails("testService")).thenReturn(Optional.of(serviceDetails));
        when(restTemplate.exchange(anyString(), eq(HttpMethod.POST), any(HttpEntity.class), eq(String.class)))
                .thenReturn(ResponseEntity.ok("success"));

        var result1 = serviceInvoker.invokeOperation(operation, "body");
        var result2 = serviceInvoker.invokeOperation(operation, "body");

        assertEquals(result1.isSuccess(), result2.isSuccess());
        assertEquals(result1.getStatusCode(), result2.getStatusCode());
    }

    @Test
    void regressionLock_notFound_errorMessageFormat() {
        String operation = "nonexistent";
        when(discoveryClient.findServiceByOperation(operation)).thenReturn(Optional.empty());

        var result = serviceInvoker.invokeOperation(operation, new Object());

        assertEquals("No service found for operation: nonexistent", result.getErrorMessage(),
            "REGRESSION LOCK: not-found error message format");
    }

    @Test
    void regressionLock_noDetails_errorMessageFormat() {
        String operation = "testOperation";
        ServiceDiscoveryClientImpl.ServiceInfoImpl serviceInfo = new ServiceDiscoveryClientImpl.ServiceInfoImpl();
        serviceInfo.setName("testService");

        when(discoveryClient.findServiceByOperation(operation)).thenReturn(Optional.of(serviceInfo));
        when(discoveryClient.getServiceDetails("testService")).thenReturn(Optional.empty());

        var result = serviceInvoker.invokeOperation(operation, new Object());

        assertTrue(result.getErrorMessage().startsWith("Could not get details for service"),
            "REGRESSION LOCK: no-details error message prefix");
    }

    @Test
    void metamorphic_healthCheck_nullEndpoint_appendsCorrectly() {
        String serviceName = "testService";
        ServiceDiscoveryClientImpl.ServiceDetailsImpl serviceDetails = new ServiceDiscoveryClientImpl.ServiceDetailsImpl();
        serviceDetails.setEndpoint("http://test-service:8080");
        serviceDetails.setHealthCheck(null);

        when(discoveryClient.getServiceDetails(serviceName)).thenReturn(Optional.of(serviceDetails));
        when(restTemplate.getForEntity("http://test-service:8080", String.class))
                .thenReturn(ResponseEntity.ok("healthy"));

        boolean result = serviceInvoker.healthCheck(serviceName);

        assertTrue(result, "Null healthCheck should fall back to endpoint-only URL");
    }
}