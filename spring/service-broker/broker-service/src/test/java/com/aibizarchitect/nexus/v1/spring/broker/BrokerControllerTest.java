package com.aibizarchitect.nexus.v1.spring.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.Collections;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import com.aibizarchitect.nexus.v1.spring.broker.Broker;
import com.aibizarchitect.nexus.v1.spring.broker.BrokerController;
import com.aibizarchitect.nexus.v1.broker.api.ServiceRequest;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponseBody;
import com.aibizarchitect.nexus.v1.spring.service.AdminLoggingService;

@ExtendWith(MockitoExtension.class)
class BrokerControllerTest {

    @Mock
    private Broker broker;

    @Mock
    private AdminLoggingService adminLoggingService;

    private BrokerController brokerController;

    @BeforeEach
    void setUp() {
        brokerController = new BrokerController(broker, adminLoggingService);
    }

    @Test
    void testSubmitRequestSuccess() {
        // Arrange
        com.aibizarchitect.nexus.v1.broker.api.ServiceRequest v1Request = new com.aibizarchitect.nexus.v1.broker.api.ServiceRequest(
                "testService", "testOperation",
                Collections.emptyMap(), "test-request");
        ServiceResponse<?> mockResponse = ServiceResponse.ok("Test Data", "test-request");

        doReturn(mockResponse).when(broker).submit(any(ServiceRequest.class));

        // Act
        ResponseEntity<ServiceResponseBody> response = brokerController.submitRequest(v1Request);

        // Assert
        assertEquals(200, response.getStatusCodeValue());
        ServiceResponseBody responseBody = response.getBody();
        assertNotNull(responseBody);
        assertTrue(responseBody.isOk());
        assertEquals("Test Data", responseBody.getData());
        assertEquals("test-request", responseBody.getRequestId());

        verify(broker).submit(any(ServiceRequest.class));
    }

    @Test
    void testSubmitRequestError() {
        // Arrange
        com.aibizarchitect.nexus.v1.broker.api.ServiceRequest v1Request = new com.aibizarchitect.nexus.v1.broker.api.ServiceRequest(
                "testService", "testOperation",
                Collections.emptyMap(), "test-request");
        ServiceResponse<?> mockResponse = ServiceResponse.error(
                java.util.List.of(java.util.Map.of("error", "Service error")), "test-request");

        doReturn(mockResponse).when(broker).submit(any(ServiceRequest.class));

        // Act
        ResponseEntity<ServiceResponseBody> response = brokerController.submitRequest(v1Request);

        // Assert
        assertEquals(400, response.getStatusCodeValue());
        ServiceResponseBody responseBody = response.getBody();
        assertNotNull(responseBody);
        assertFalse(responseBody.isOk());
        assertNotNull(responseBody.getErrors());

        verify(broker).submit(any(ServiceRequest.class));
    }

    @Test
    void testTestBrokerEndpoint() {
        // Arrange
        ServiceResponse<?> mockResponse = ServiceResponse.ok("Test Data", "test-request");

        doReturn(mockResponse).when(broker).submit(any(ServiceRequest.class));

        // Act
        ResponseEntity<ServiceResponseBody> response = brokerController.testBroker();

        // Assert
        assertEquals(200, response.getStatusCodeValue());
        ServiceResponseBody responseBody = response.getBody();
        assertNotNull(responseBody);
        assertTrue(responseBody.isOk());
        assertEquals("Test Data", responseBody.getData());
        assertEquals("test-request", responseBody.getRequestId());

        verify(broker).submit(any(ServiceRequest.class));
    }

    @Test
    void testTestBrokerEndpointError() {
        // Arrange
        ServiceResponse<?> mockResponse = ServiceResponse.error(
                java.util.List.of(java.util.Map.of("error", "Test error")), "test-request");

        doReturn(mockResponse).when(broker).submit(any(ServiceRequest.class));

        // Act
        ResponseEntity<ServiceResponseBody> response = brokerController.testBroker();

        // Assert
        assertEquals(400, response.getStatusCodeValue());
        ServiceResponseBody responseBody = response.getBody();
        assertNotNull(responseBody);
        assertFalse(responseBody.isOk());
        assertNotNull(responseBody.getErrors());

        verify(broker).submit(any(ServiceRequest.class));
    }

    @Test
    void testBrokerSubmitInvokedWithCorrectRequest() {
        // Arrange
        com.aibizarchitect.nexus.v1.broker.api.ServiceRequest v1Request = new com.aibizarchitect.nexus.v1.broker.api.ServiceRequest(
                "userService", "createUser",
                java.util.Map.of("name", "John", "email", "john@example.com"), "request-123");

        ServiceResponse<?> mockResponse = ServiceResponse.ok("User created", "request-123");

        doReturn(mockResponse).when(broker).submit(any(ServiceRequest.class));

        // Act
        ResponseEntity<ServiceResponseBody> response = brokerController.submitRequest(v1Request);

        // Verify that broker.submit was called
        verify(broker).submit(any(ServiceRequest.class));
    }

    @Test
    void testNullRequestToSubmitRequest() {
        // Arrange
        com.aibizarchitect.nexus.v1.broker.api.ServiceRequest v1Request = null;

        // Act - null request is handled by the controller, not passed to broker
        ResponseEntity<ServiceResponseBody> response = brokerController.submitRequest(v1Request);

        // Assert - should return 400 Bad Request without calling broker
        assertEquals(400, response.getStatusCodeValue());
        assertNotNull(response.getBody());
        assertFalse(response.getBody().isOk());

        // Verify broker was NOT called since we handle null requests in the controller
        verify(broker, never()).submit(any(ServiceRequest.class));
    }

    @Test
    void testBrokerControllerInitialization() {
        // Test that the controller is properly initialized with the broker
        assertNotNull(brokerController);

        // Check that the broker field is set
        // Note: We can't directly access private fields, so we test behavior instead
        com.aibizarchitect.nexus.v1.broker.api.ServiceRequest v1Request = new com.aibizarchitect.nexus.v1.broker.api.ServiceRequest(
                "test", "test", Collections.emptyMap(), "test");
        ServiceResponse<?> expectedResponse = ServiceResponse.ok("test", "test");
        doReturn(expectedResponse).when(broker).submit(any(ServiceRequest.class));

        ResponseEntity<ServiceResponseBody> response = brokerController.submitRequest(v1Request);

        assertNotNull(response);
        verify(broker).submit(any(ServiceRequest.class));
    }
}
