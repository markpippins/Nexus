package com.aibizarchitect.nexus.v1.spring.broker.gateway.service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.aibizarchitect.nexus.v1.spring.broker.spi.ExternalServiceInvoker;
import com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient;
import com.aibizarchitect.nexus.v1.spring.broker.spi.ServiceDiscoveryClient.ServiceDetails;

@Service
public class ExternalServiceInvokerImpl implements ExternalServiceInvoker {

    private static final Logger log = LoggerFactory.getLogger(ExternalServiceInvokerImpl.class);

    private final ServiceDiscoveryClient discoveryClient;
    private final RestTemplate restTemplate;

    public ExternalServiceInvokerImpl(ServiceDiscoveryClient discoveryClient,
                                      RestTemplate restTemplate) {
        this.discoveryClient = discoveryClient;
        this.restTemplate = restTemplate;
    }

    @Override
    public InvocationResult invokeOperation(String operation, Object requestBody) {
        // Null/blank guard — prevents NPE in URL encoding and downstream calls
        if (operation == null || operation.isBlank()) {
            log.warn("invokeOperation called with null or blank operation");
            return new InvocationResultImpl(false, 404, null, "Operation name is required");
        }

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

        // Guard against null endpoint (was NPE before this fix)
        if (endpoint == null || endpoint.isBlank()) {
            log.error("Service {} has no endpoint configured", serviceName);
            return new InvocationResultImpl(false, 500, null,
                    "Service has no endpoint configured: " + serviceName);
        }

        // URL-encode the operation name to prevent injection
        String encodedOperation = URLEncoder.encode(operation, StandardCharsets.UTF_8);

        // Build the full URL for the operation
        String operationUrl = endpoint.endsWith("/") ? endpoint + encodedOperation : endpoint + "/" + encodedOperation;

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
        // Guard against null endpoint
        if (healthCheckUrl == null) {
            log.warn("Service {} has no endpoint for health check", serviceName);
            return false;
        }
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
