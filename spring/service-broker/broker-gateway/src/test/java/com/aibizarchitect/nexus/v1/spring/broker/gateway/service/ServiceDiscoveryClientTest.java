package com.aibizarchitect.nexus.v1.spring.broker.gateway.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.client.RestTemplate;

import com.aibizarchitect.nexus.v1.spring.broker.gateway.service.ServiceDiscoveryClientImpl;

@ExtendWith(MockitoExtension.class)
class ServiceDiscoveryClientTest {

        @Mock
        private RestTemplate restTemplate;

        private ServiceDiscoveryClientImpl discoveryClient;

        @BeforeEach
        void setUp() {
                discoveryClient = new ServiceDiscoveryClientImpl("http://localhost:8085", restTemplate);
        }

        @Test
        void findServiceByOperation_WithExistingService_ShouldReturnServiceInfo() {
                // Given
                String operation = "testOperation";
                ServiceDiscoveryClientImpl.ServiceInfoImpl expectedServiceInfo = new ServiceDiscoveryClientImpl.ServiceInfoImpl();
                expectedServiceInfo.setName("testService");
                expectedServiceInfo.setId(1L);

                when(restTemplate.getForObject(
                                eq("http://localhost:8085/api/v1/registry/services/by-operation/testOperation"),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class))).thenReturn(expectedServiceInfo);

                // When
                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceInfo> result = discoveryClient
                                .findServiceByOperation(operation);

                // Then
                assertTrue(result.isPresent());
                assertEquals("testService", result.get().getName());
                assertEquals(Long.valueOf(1L), result.get().getId());
                verify(restTemplate).getForObject(
                                eq("http://localhost:8085/api/v1/registry/services/by-operation/testOperation"),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class));
        }

        @Test
        void findServiceByOperation_WithNoServiceFound_ShouldReturnEmpty() {
                // Given
                String operation = "nonExistentOperation";

                when(restTemplate.getForObject(
                                eq("http://localhost:8085/api/v1/registry/services/by-operation/nonExistentOperation"),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class))).thenReturn(null);

                // When
                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceInfo> result = discoveryClient
                                .findServiceByOperation(operation);

                // Then
                assertFalse(result.isPresent());
                verify(restTemplate).getForObject(
                                eq("http://localhost:8085/api/v1/registry/services/by-operation/nonExistentOperation"),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class));
        }

        @Test
        void findServiceByOperation_WithRestTemplateException_ShouldReturnEmpty() {
                // Given
                String operation = "errorOperation";

                when(restTemplate.getForObject(
                                eq("http://localhost:8085/api/v1/registry/services/by-operation/errorOperation"),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class)))
                                .thenThrow(new RuntimeException("Connection failed"));

                // When
                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceInfo> result = discoveryClient
                                .findServiceByOperation(operation);

                // Then
                assertFalse(result.isPresent());
                verify(restTemplate).getForObject(
                                eq("http://localhost:8085/api/v1/registry/services/by-operation/errorOperation"),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class));
        }

        @Test
        void getServiceDetails_WithExistingService_ShouldReturnServiceDetails() {
                // Given
                String serviceName = "testService";
                ServiceDiscoveryClientImpl.ServiceDetailsImpl expectedServiceDetails = new ServiceDiscoveryClientImpl.ServiceDetailsImpl();
                expectedServiceDetails.setServiceName("testService");
                expectedServiceDetails.setEndpoint("http://test-service:8080");

                when(restTemplate.getForObject(
                                eq("http://localhost:8085/api/v1/registry/services/testService/details"),
                                eq(ServiceDiscoveryClientImpl.ServiceDetailsImpl.class)))
                                .thenReturn(expectedServiceDetails);

                // When
                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceDetails> result = discoveryClient
                                .getServiceDetails(serviceName);

                // Then
                assertTrue(result.isPresent());
                assertEquals("testService", result.get().getServiceName());
                assertEquals("http://test-service:8080", result.get().getEndpoint());
                verify(restTemplate).getForObject(
                                eq("http://localhost:8085/api/v1/registry/services/testService/details"),
                                eq(ServiceDiscoveryClientImpl.ServiceDetailsImpl.class));
        }

        @Test
        void getServiceDetails_WithNoServiceFound_ShouldReturnEmpty() {
                // Given
                String serviceName = "nonExistentService";

                when(restTemplate.getForObject(
                                eq("http://localhost:8085/api/v1/registry/services/nonExistentService/details"),
                                eq(ServiceDiscoveryClientImpl.ServiceDetailsImpl.class))).thenReturn(null);

                // When
                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceDetails> result = discoveryClient
                                .getServiceDetails(serviceName);

                // Then
                assertFalse(result.isPresent());
                verify(restTemplate).getForObject(
                                eq("http://localhost:8085/api/v1/registry/services/nonExistentService/details"),
                                eq(ServiceDiscoveryClientImpl.ServiceDetailsImpl.class));
        }

        @Test
        void getServiceDetails_WithRestTemplateException_ShouldReturnEmpty() {
                // Given
                String serviceName = "errorService";

                when(restTemplate.getForObject(
                                eq("http://localhost:8085/api/v1/registry/services/errorService/details"),
                                eq(ServiceDiscoveryClientImpl.ServiceDetailsImpl.class)))
                                .thenThrow(new RuntimeException("Connection failed"));

                // When
                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceDetails> result = discoveryClient
                                .getServiceDetails(serviceName);

                // Then
                assertFalse(result.isPresent());
                verify(restTemplate).getForObject(
                                eq("http://localhost:8085/api/v1/registry/services/errorService/details"),
                                eq(ServiceDiscoveryClientImpl.ServiceDetailsImpl.class));
        }

        @Test
        void serviceInfo_GettersAndSetters_ShouldWorkCorrectly() {
                // Given
                ServiceDiscoveryClientImpl.ServiceInfoImpl serviceInfo = new ServiceDiscoveryClientImpl.ServiceInfoImpl();

                // When
                serviceInfo.setId(123L);
                serviceInfo.setName("testService");
                serviceInfo.setDescription("Test service description");
                serviceInfo.setStatus("ACTIVE");

                // Then
                assertEquals(Long.valueOf(123L), serviceInfo.getId());
                assertEquals("testService", serviceInfo.getName());
                assertEquals("Test service description", serviceInfo.getDescription());
                assertEquals("ACTIVE", serviceInfo.getStatus());
        }

        @Test
        void serviceDetails_GettersAndSetters_ShouldWorkCorrectly() {
                // Given
                ServiceDiscoveryClientImpl.ServiceDetailsImpl serviceDetails = new ServiceDiscoveryClientImpl.ServiceDetailsImpl();

                // When
                serviceDetails.setServiceName("testService");
                serviceDetails.setEndpoint("http://test-service:8080");
                serviceDetails.setHealthCheck("/health");
                serviceDetails.setFramework("Spring Boot");
                serviceDetails.setStatus("ACTIVE");
                serviceDetails.setOperations("op1,op2,op3");

                // Then
                assertEquals("testService", serviceDetails.getServiceName());
                assertEquals("http://test-service:8080", serviceDetails.getEndpoint());
                assertEquals("/health", serviceDetails.getHealthCheck());
                assertEquals("Spring Boot", serviceDetails.getFramework());
                assertEquals("ACTIVE", serviceDetails.getStatus());
                assertEquals("op1,op2,op3", serviceDetails.getOperations());
        }
}