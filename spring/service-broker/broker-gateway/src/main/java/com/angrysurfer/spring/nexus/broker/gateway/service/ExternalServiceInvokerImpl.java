package com.angrysurfer.spring.nexus.broker.gateway.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.angrysurfer.spring.nexus.broker.spi.ExternalServiceInvoker;
import com.angrysurfer.spring.nexus.broker.spi.ServiceDiscoveryClient;
import com.angrysurfer.spring.nexus.broker.spi.ServiceDiscoveryClient.ServiceDetails;

@Service
public class ExternalServiceInvokerImpl implements ExternalServiceInvoker {

    private static final Logger log = LoggerFactory.getLogger(ExternalServiceInvokerImpl.class);

    @Autowired
    private ServiceDiscoveryClient discoveryClient;

    @Autowired
    private RestTemplate restTemplate;

    // For testing purposes
    public void setDiscoveryClient(ServiceDiscoveryClient discoveryClient) {
        this.discoveryClient = discoveryClient;
    }

    // For testing purposes
    public void setRestTemplate(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Override
    public InvocationResult invokeOperation(String operation, Object requestBody) {
        log.info("Invoking operation: {} on external service", operation);

        // Find service that can handle this operation
        var serviceOpt = discoveryClient.findServiceByOperation(operation);
        if (serviceOpt.isEmpty()) {
            log.warn("No service found for operation: {}", operation);
            return new InvocationResultImpl(false, 404, null, "No service found for operation: " + operation);
        }

        String serviceName = serviceOpt.get().getName();
        log.debug("Found service {} for operation: {}", serviceName, operation);

        // Get service details
        var detailsOpt = discoveryClient.getServiceDetails(serviceName);
        if (detailsOpt.isEmpty()) {
            log.error("Could not get details for service: {}", serviceName);
            return new InvocationResultImpl(false, 500, null, "Could not get details for service: " + serviceName);
        }

        ServiceDetails details = detailsOpt.get();
        String endpoint = details.getEndpoint();

        // Build the full URL for the operation
        String operationUrl = endpoint.endsWith("/") ? endpoint + operation : endpoint + "/" + operation;

        log.debug("Invoking operation at: {}", operationUrl);

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Content-Type", "application/json");

            HttpEntity<Object> requestEntity = new HttpEntity<>(requestBody, headers);

            ResponseEntity<String> response = restTemplate.exchange(
                    operationUrl,
                    HttpMethod.POST,
                    requestEntity,
                    String.class);

            log.info("Successfully invoked operation {} on service {}. Status: {}",
                    operation, serviceName, response.getStatusCode());

            return new InvocationResultImpl(
                    response.getStatusCode().is2xxSuccessful(),
                    response.getStatusCode().value(),
                    response.getBody(),
                    null);
        } catch (Exception e) {
            log.error("Failed to invoke operation {} on service {}: {}",
                    operation, serviceName, e.getMessage(), e);
            return new InvocationResultImpl(false, 500, null, "Failed to invoke external service: " + e.getMessage());
        }
    }

    @Override
    public boolean healthCheck(String serviceName) {
        log.debug("Performing health check for service: {}", serviceName);

        var detailsOpt = discoveryClient.getServiceDetails(serviceName);
        if (detailsOpt.isEmpty()) {
            log.warn("Service not found for health check: {}", serviceName);
            return false;
        }

        ServiceDetails details = detailsOpt.get();
        String healthCheckUrl = details.getEndpoint();
        if (details.getHealthCheck() != null && !details.getHealthCheck().isEmpty()) {
            healthCheckUrl = details.getEndpoint().endsWith("/") ? details.getEndpoint() + details.getHealthCheck()
                    : details.getEndpoint() + "/" + details.getHealthCheck();
        }

        try {
            ResponseEntity<String> response = restTemplate.getForEntity(healthCheckUrl, String.class);
            boolean healthy = response.getStatusCode().is2xxSuccessful();
            log.debug("Health check for service {}: {}", serviceName, healthy ? "healthy" : "unhealthy");
            return healthy;
        } catch (Exception e) {
            log.warn("Health check failed for service {}: {}", serviceName, e.getMessage());
            return false;
        }
    }

    /**
     * Simple implementation of InvocationResult
     */
    private static class InvocationResultImpl implements InvocationResult {
        private final boolean success;
        private final int statusCode;
        private final String body;
        private final String errorMessage;

        public InvocationResultImpl(boolean success, int statusCode, String body, String errorMessage) {
            this.success = success;
            this.statusCode = statusCode;
            this.body = body;
            this.errorMessage = errorMessage;
        }

        @Override
        public boolean isSuccess() {
            return success;
        }

        @Override
        public int getStatusCode() {
            return statusCode;
        }

        @Override
        public String getBody() {
            return body;
        }

        @Override
        public String getErrorMessage() {
            return errorMessage;
        }
    }
}
