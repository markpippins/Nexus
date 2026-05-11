package com.aibizarchitect.nexus.v1.spring.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationContext;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import com.aibizarchitect.nexus.v1.broker.api.ServiceRequest;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerOperation;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerParam;
import com.aibizarchitect.nexus.v1.spring.broker.spi.ExternalServiceInvoker;
import com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient;

import jakarta.validation.Validator;

@ExtendWith(MockitoExtension.class)
class BrokerTest {

    @Mock
    private ApplicationContext applicationContext;

    @Mock
    private com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    @Mock
    private ServiceDiscoveryClient serviceDiscoveryClient;

    @Mock
    private ExternalServiceInvoker externalServiceInvoker;

    private Validator validator;

    private Broker broker;

    @BeforeEach
    void setUp() {
        // Initialize validator using Spring's implementation
        LocalValidatorFactoryBean localValidatorFactoryBean = new LocalValidatorFactoryBean();
        localValidatorFactoryBean.afterPropertiesSet();
        validator = localValidatorFactoryBean;

        broker = new Broker(applicationContext, objectMapper, validator,
                serviceDiscoveryClient, externalServiceInvoker);
    }

    @Test
    void testSubmitSuccess() {
        // Arrange
        TestBean testBean = new TestBean();
        ServiceRequest request = new ServiceRequest("testBean", "testOperation",
                Map.of("param1", "value1"), "test-request");

        when(applicationContext.containsBean("testBean")).thenReturn(true);
        when(applicationContext.getBean("testBean")).thenReturn(testBean);
        // Mock the objectMapper to handle both the JavaType and null cases, using
        // lenient to avoid unnecessary stubbing errors
        lenient().when(objectMapper.convertValue(eq("value1"), any(com.fasterxml.jackson.databind.JavaType.class)))
                .thenReturn("value1");
        lenient().when(objectMapper.convertValue(eq("value1"), isNull(com.fasterxml.jackson.databind.JavaType.class)))
                .thenReturn("value1");

        // Act
        ServiceResponse<?> response = broker.submit(request);

        // Assert
        assertTrue(response.isOk());
        assertEquals("test-request", response.getRequestId());
        assertEquals("Test Result", response.getData());
    }

    @Test
    void testSubmitWithServiceResponseReturn() {
        // Arrange
        ServiceResponseReturnBean serviceResponseReturnBean = new ServiceResponseReturnBean();
        ServiceRequest request = new ServiceRequest("serviceResponseReturnBean", "getServiceResponse",
                new HashMap<>(), "test-request");

        when(applicationContext.containsBean("serviceResponseReturnBean")).thenReturn(true);
        when(applicationContext.getBean("serviceResponseReturnBean")).thenReturn(serviceResponseReturnBean);

        // Act
        ServiceResponse<?> response = broker.submit(request);

        // Assert
        assertTrue(response.isOk());
        assertEquals("test-request", response.getRequestId());
        assertEquals("Direct ServiceResponse", response.getData());
    }

    @Test
    void testSubmitNoSuchBean() {
        // Arrange
        ServiceRequest request = new ServiceRequest("nonExistentBean", "testOperation",
                new HashMap<>(), "test-request");

        when(applicationContext.containsBean("nonExistentBean")).thenReturn(false);
        when(applicationContext.getBeanDefinitionNames()).thenReturn(new String[0]);

        // Act
        ServiceResponse<?> response = broker.submit(request);

        // Assert
        assertFalse(response.isOk());
        assertNotNull(response.getErrors());
        assertTrue(response.getErrors().stream()
                .anyMatch(error -> error.get("message").toString().contains("Service bean not found")));
    }

    @Test
    void testSubmitNoSuchMethod() {
        // Arrange
        TestBean testBean = new TestBean();
        ServiceRequest request = new ServiceRequest("testBean", "nonExistentOperation",
                new HashMap<>(), "test-request");

        when(applicationContext.containsBean("testBean")).thenReturn(true);
        when(applicationContext.getBean("testBean")).thenReturn(testBean);

        // Act
        ServiceResponse<?> response = broker.submit(request);

        // Assert
        assertFalse(response.isOk());
        assertNotNull(response.getErrors());
        assertTrue(response.getErrors().stream()
                .anyMatch(error -> error.get("message").toString().contains("Operation not exposed")));
    }

    @Test
    void testSubmitMissingServiceName() {
        // Arrange
        ServiceRequest request = new ServiceRequest(null, "testOperation", new HashMap<>(), "test-request");

        // Act
        ServiceResponse<?> response = broker.submit(request);

        // Assert
        assertFalse(response.isOk());
        assertNotNull(response.getErrors());
        assertTrue(response.getErrors().stream()
                .anyMatch(error -> error.get("message").toString().contains("Missing 'service' name")));
    }

    @Test
    void testSubmitMissingOperationName() {
        // Arrange
        TestBean testBean = new TestBean();
        ServiceRequest request = new ServiceRequest("testBean", null, new HashMap<>(), "test-request");

        when(applicationContext.containsBean("testBean")).thenReturn(true);
        when(applicationContext.getBean("testBean")).thenReturn(testBean);

        // Act
        ServiceResponse<?> response = broker.submit(request);

        // Assert
        assertFalse(response.isOk());
        assertNotNull(response.getErrors());
        assertTrue(response.getErrors().stream()
                .anyMatch(error -> error.get("message").toString().contains("Missing 'operation' name")));
    }

    @Test
    void testSubmitParameterBindingError() {
        // Arrange
        TestBean testBean = new TestBean();
        ServiceRequest request = new ServiceRequest("testBean", "testOperation",
                Map.of("param1", "value"), "test-request");

        when(applicationContext.containsBean("testBean")).thenReturn(true);
        when(applicationContext.getBean("testBean")).thenReturn(testBean);
        // Mock objectMapper to throw an exception when converting the value for param1,
        // using lenient to avoid unnecessary stubbing
        lenient().when(objectMapper.convertValue(eq("value"), any(com.fasterxml.jackson.databind.JavaType.class)))
                .thenThrow(new IllegalArgumentException("Cannot convert"));
        lenient().when(objectMapper.convertValue(eq("value"), isNull(com.fasterxml.jackson.databind.JavaType.class)))
                .thenThrow(new IllegalArgumentException("Cannot convert"));

        // Act
        ServiceResponse<?> response = broker.submit(request);

        // Assert
        assertFalse(response.isOk());
        assertNotNull(response.getErrors());
        assertTrue(response.getErrors().stream()
                .anyMatch(error -> error.get("message").toString().contains("Cannot convert")));
    }

    @Test
    void testSubmitMethodInvocationError() {
        // Arrange
        ExceptionThrowingBean exceptionBean = new ExceptionThrowingBean();
        ServiceRequest request = new ServiceRequest("exceptionBean", "throwException",
                new HashMap<>(), "test-request");

        when(applicationContext.containsBean("exceptionBean")).thenReturn(true);
        when(applicationContext.getBean("exceptionBean")).thenReturn(exceptionBean);

        // Act
        ServiceResponse<?> response = broker.submit(request);

        // Assert
        assertFalse(response.isOk());
        assertNotNull(response.getErrors());
        assertTrue(response.getErrors().stream()
                .anyMatch(error -> error.get("message").toString().contains("Test exception")));
    }

    @Test
    void testSubmitValidationErrors() {
        // Arrange
        ValidationBean validationBean = new ValidationBean();
        ServiceRequest request = new ServiceRequest("validationBean", "validateMethod",
                Map.of("invalidValue", "a"), "test-request"); // "a" is less than min length of 3

        when(applicationContext.containsBean("validationBean")).thenReturn(true);
        when(applicationContext.getBean("validationBean")).thenReturn(validationBean);

        // Act
        ServiceResponse<?> response = broker.submit(request);

        // Assert
        assertFalse(response.isOk());
        assertNotNull(response.getErrors());
    }

    @Test
    void testSubmitWithNullParams() {
        // Arrange
        TestBean testBean = new TestBean();
        ServiceRequest request = new ServiceRequest("testBean", "testOperation", null, "test-request");

        when(applicationContext.containsBean("testBean")).thenReturn(true);
        when(applicationContext.getBean("testBean")).thenReturn(testBean);

        // Act
        ServiceResponse<?> response = broker.submit(request);

        // Assert
        // Current broker implementation requires all @BrokerParam parameters to be
        // present
        // So this should fail with a missing parameter error
        assertFalse(response.isOk());
        assertNotNull(response.getErrors());
        assertTrue(response.getErrors().stream()
                .anyMatch(error -> error.get("message").toString().contains("Missing required parameter")));
    }

    @Test
    void testResolveBeanBySimpleName() {
        // Arrange
        TestBean testBean = new TestBean();
        ServiceRequest request = new ServiceRequest("TestBean", "testOperation",
                Map.of("param1", "value1"), "test-request");

        when(applicationContext.containsBean("TestBean")).thenReturn(false);
        when(applicationContext.getBeanDefinitionNames()).thenReturn(new String[] { "testBeanInstance" });
        when(applicationContext.getBean("testBeanInstance")).thenReturn(testBean);
        // Mock the objectMapper to properly convert the "value1" to the expected type,
        // using lenient to avoid unnecessary stubbing errors
        // Handle both JavaType and null cases
        lenient().when(objectMapper.convertValue(eq("value1"), any(com.fasterxml.jackson.databind.JavaType.class)))
                .thenReturn("value1");
        lenient().when(objectMapper.convertValue(eq("value1"), isNull(com.fasterxml.jackson.databind.JavaType.class)))
                .thenReturn("value1");

        // Act
        ServiceResponse<?> response = broker.submit(request);

        // Assert
        assertTrue(response.isOk());
        assertEquals("Test Result", response.getData());
    }

    // Test beans for mocking purposes
    public static class TestBean {
        @BrokerOperation("testOperation")
        public String testOperation(@BrokerParam("param1") String param1) {
            return "Test Result";
        }
    }

    public static class ServiceResponseReturnBean {
        @BrokerOperation("getServiceResponse")
        public ServiceResponse<String> getServiceResponse() {
            return ServiceResponse.ok("Direct ServiceResponse", "test-request");
        }
    }

    public static class ExceptionThrowingBean {
        @BrokerOperation("throwException")
        public String throwException() {
            throw new RuntimeException("Test exception");
        }
    }

    public static class ValidationBean {
        @BrokerOperation("validateMethod")
        public String validateMethod(@jakarta.validation.constraints.Size(min = 3) String invalidValue) {
            return "Valid";
        }
    }
}
