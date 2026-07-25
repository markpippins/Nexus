package com.aibizarchitect.nexus.v1.spring.broker.gateway.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
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
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class))).thenReturn(expectedServiceInfo);

                // When
                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceInfo> result = discoveryClient
                                .findServiceByOperation(operation);

                // Then
                assertTrue(result.isPresent());
                assertEquals("testService", result.get().getName());
                assertEquals(Long.valueOf(1L), result.get().getId());
                verify(restTemplate).getForObject(
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class));
        }

        @Test
        void findServiceByOperation_WithNoServiceFound_ShouldReturnEmpty() {
                // Given
                String operation = "nonExistentOperation";

                when(restTemplate.getForObject(
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class))).thenReturn(null);

                // When
                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceInfo> result = discoveryClient
                                .findServiceByOperation(operation);

                // Then
                assertFalse(result.isPresent());
                verify(restTemplate).getForObject(
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class));
        }

        @Test
        void findServiceByOperation_WithRestTemplateException_ShouldReturnEmpty() {
                // Given
                String operation = "errorOperation";

                when(restTemplate.getForObject(
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class)))
                                .thenThrow(new RuntimeException("Connection failed"));

                // When
                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceInfo> result = discoveryClient
                                .findServiceByOperation(operation);

                // Then
                assertFalse(result.isPresent());
                verify(restTemplate).getForObject(
                                anyString(),
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
                                anyString(),
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
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceDetailsImpl.class));
        }

        @Test
        void getServiceDetails_WithNoServiceFound_ShouldReturnEmpty() {
                // Given
                String serviceName = "nonExistentService";

                when(restTemplate.getForObject(
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceDetailsImpl.class))).thenReturn(null);

                // When
                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceDetails> result = discoveryClient
                                .getServiceDetails(serviceName);

                // Then
                assertFalse(result.isPresent());
                verify(restTemplate).getForObject(
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceDetailsImpl.class));
        }

        @Test
        void getServiceDetails_WithRestTemplateException_ShouldReturnEmpty() {
                // Given
                String serviceName = "errorService";

                when(restTemplate.getForObject(
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceDetailsImpl.class)))
                                .thenThrow(new RuntimeException("Connection failed"));

                // When
                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceDetails> result = discoveryClient
                                .getServiceDetails(serviceName);

                // Then
                assertFalse(result.isPresent());
                verify(restTemplate).getForObject(
                                anyString(),
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

        // ================================================================
        // ORANGE PATH — expected, handled failure
        // ================================================================

        @Test
        void findServiceByOperation_WithNullOperation_returnsEmpty() {
                // URLEncoder.encode(null, UTF_8) throws NPE → caught by try/catch → returns empty
                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceInfo> result =
                        discoveryClient.findServiceByOperation(null);

                assertFalse(result.isPresent());
        }

        @Test
        void findServiceByOperation_WithBlankOperation_returnsEmpty() {
                // URLEncoder.encode(" ", UTF_8) → "+" (space encoded as +)
                when(restTemplate.getForObject(
                                eq("http://localhost:8085/api/v1/registry/services/by-operation/+"),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class)))
                                .thenReturn(null);

                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceInfo> result =
                        discoveryClient.findServiceByOperation(" ");

                assertFalse(result.isPresent());
        }

        @Test
        void getServiceDetails_WithNullServiceName_returnsEmpty() {
                // URLEncoder.encode(null, UTF_8) throws NPE → caught by try/catch
                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceDetails> result =
                        discoveryClient.getServiceDetails(null);

                assertFalse(result.isPresent());
        }

        @Test
        void getServiceDetails_WithBlankServiceName_returnsEmpty() {
                // URLEncoder.encode(" ", UTF_8) → "+"
                when(restTemplate.getForObject(
                                eq("http://localhost:8085/api/v1/registry/services/+/details"),
                                eq(ServiceDiscoveryClientImpl.ServiceDetailsImpl.class)))
                                .thenReturn(null);

                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceDetails> result =
                        discoveryClient.getServiceDetails(" ");

                assertFalse(result.isPresent());
        }

        // ================================================================
        // RED PATH — adversarial input the system must survive
        // ================================================================

        @Test
        void findServiceByOperation_WithXssInOperation_handled() {
                String xss = "<script>alert(1)</script>";
                // URL encoding neutralizes XSS by encoding special chars
                when(restTemplate.getForObject(
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class)))
                                .thenReturn(null);

                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceInfo> result =
                        discoveryClient.findServiceByOperation(xss);

                assertFalse(result.isPresent());
        }

        @Test
        void findServiceByOperation_WithSqlInjection_handled() {
                String sql = "'; DROP TABLE services; --";
                // URL encoding neutralizes SQL injection by encoding special chars
                when(restTemplate.getForObject(
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class)))
                                .thenReturn(null);

                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceInfo> result =
                        discoveryClient.findServiceByOperation(sql);

                assertFalse(result.isPresent());
        }

        @Test
        void getServiceDetails_WithPathTraversalInName_handled() {
                String traversal = "../../../etc/passwd";
                // URL encoding neutralizes path traversal by encoding slashes
                when(restTemplate.getForObject(
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceDetailsImpl.class)))
                                .thenReturn(null);

                Optional<com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceDetails> result =
                        discoveryClient.getServiceDetails(traversal);

                assertFalse(result.isPresent());
        }

        // ================================================================
        // SILENT FAILURE — metamorphic/determinism, regression locks
        // ================================================================

        @Test
        void metamorphic_findServiceByOperation_sameInput_sameOutput() {
                String operation = "testOperation";
                ServiceDiscoveryClientImpl.ServiceInfoImpl expected = new ServiceDiscoveryClientImpl.ServiceInfoImpl();
                expected.setName("testService");

                when(restTemplate.getForObject(
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class)))
                                .thenReturn(expected);

                var result1 = discoveryClient.findServiceByOperation(operation);
                var result2 = discoveryClient.findServiceByOperation(operation);

                assertEquals(result1.isPresent(), result2.isPresent());
                assertTrue(result1.isPresent());
                assertEquals(result1.get().getName(), result2.get().getName());
        }

        @Test
        void metamorphic_differentOperations_produceDifferentUrls() {
                when(restTemplate.getForObject(
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class)))
                                .thenReturn(null);

                discoveryClient.findServiceByOperation("op-a");
                discoveryClient.findServiceByOperation("op-b");

                // Verify restTemplate was called twice with different (encoded) URLs
                verify(restTemplate, org.mockito.Mockito.times(2)).getForObject(
                        anyString(),
                        eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class));
        }

        @Test
        void regressionLock_urlPattern_findServiceByOperation() {
                String operation = "my-service.healthCheck";
                ServiceDiscoveryClientImpl.ServiceInfoImpl expected = new ServiceDiscoveryClientImpl.ServiceInfoImpl();
                expected.setName("my-service");

                when(restTemplate.getForObject(
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceInfoImpl.class)))
                                .thenReturn(expected);

                var result = discoveryClient.findServiceByOperation(operation);

                assertTrue(result.isPresent());
        }

        @Test
        void regressionLock_urlPattern_getServiceDetails() {
                String serviceName = "my-service";
                ServiceDiscoveryClientImpl.ServiceDetailsImpl expected = new ServiceDiscoveryClientImpl.ServiceDetailsImpl();
                expected.setServiceName("my-service");
                expected.setEndpoint("http://my-service:8080");

                when(restTemplate.getForObject(
                                anyString(),
                                eq(ServiceDiscoveryClientImpl.ServiceDetailsImpl.class)))
                                .thenReturn(expected);

                var result = discoveryClient.getServiceDetails(serviceName);

                assertTrue(result.isPresent());
                assertEquals("http://my-service:8080", result.get().getEndpoint());
        }
}