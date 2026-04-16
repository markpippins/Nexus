package com.angrysurfer.spring.nexus.broker;

import java.util.Collections;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

import com.angrysurfer.spring.nexus.admin.logging.service.AdminLoggingService;
import com.angrysurfer.spring.nexus.broker.api.ServiceRequest;
import com.angrysurfer.spring.nexus.broker.api.ServiceResponse;
import com.angrysurfer.spring.nexus.broker.api.v1.ServiceResponseBody;

@CrossOrigin(originPatterns = "*", allowedHeaders = "*", allowCredentials = "true", methods = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE, RequestMethod.OPTIONS})
@RestController
@RequestMapping("/api/v1/broker")
public class BrokerController {

    private static final Logger log = LoggerFactory.getLogger(BrokerController.class);

    private final Broker broker;
    private final AdminLoggingService adminLoggingService;

    public BrokerController(Broker broker, AdminLoggingService adminLoggingService) {
        this.broker = broker;
        this.adminLoggingService = adminLoggingService;
        log.info("BrokerController initialized");
    }

    @PostMapping(value = "/testBroker")
    public ResponseEntity<ServiceResponseBody> testBroker() {
        // Create a legacy request for the test
        ServiceRequest legacyRequest = new ServiceRequest("testBroker", "test",
                Collections.emptyMap(), "test-request");

        ServiceResponse<?> legacyResponse = broker.submit(legacyRequest);

        ServiceResponseBody response = ServiceResponseBody.fromLegacy(legacyResponse);

        if (response.isOk()) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping(value = "/submitRequest", consumes = {"application/json"})
    public ResponseEntity<ServiceResponseBody> submitRequest(
            @RequestBody(required = false) com.angrysurfer.spring.nexus.broker.api.v1.ServiceRequest v1Request) {
        log.debug("Received request: {}", v1Request);

        // Handle null request
        if (v1Request == null) {
            ServiceResponse<?> legacyResponse = ServiceResponse.error(
                java.util.List.of(java.util.Map.of("code", "invalid_request", "message", "Request body is null")), "null");
            ServiceResponseBody response = ServiceResponseBody.fromLegacy(legacyResponse);
            return ResponseEntity.badRequest().body(response);
        }

        // Convert v1 request to legacy request for Broker processing
        ServiceRequest legacyRequest = new ServiceRequest(
                v1Request.getService(),
                v1Request.getOperation(),
                v1Request.getParams(),
                v1Request.getRequestId());
                
        if (v1Request.isEncrypt() != null) {
            legacyRequest.setEncrypt(v1Request.isEncrypt());
        }

        // Log the request before processing it
        UUID logId = null;
        String userId = extractUserId(v1Request);
        // try {
        //     var logEntry = adminLoggingService.logRequest(legacyRequest, userId);
        //     if (logEntry != null) {
        //         logId = logEntry.getId();
        //     }
        // } catch (Exception e) {
        //     log.error("Error logging request: {}", e.getMessage(), e);
        // }

        ServiceResponse<?> legacyResponse = broker.submit(legacyRequest);

        // Convert legacy response to v1 response
        ServiceResponseBody response = ServiceResponseBody.fromLegacy(legacyResponse);

        // Update the log entry with success/failure status
        // if (logId != null) {
        //     adminLoggingService.updateLogEntry(logId, response.isOk(),
        //         response.isOk() ? null : extractErrorMessage(response));
        // }

        log.debug("Returning: {}", response);

        if (response.isOk()) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.badRequest().body(response);
        }
    }

    private String extractUserId(com.angrysurfer.spring.nexus.broker.api.v1.ServiceRequest request) {
        // Extract userId from request. This could come from a header, or be extracted from security context
        // For now, using a default value, but in a real application, this would come from authentication
        return "anonymous";
    }

    private String extractErrorMessage(ServiceResponseBody response) {
        // Extract error message from response
        if (response.getErrors() != null && !response.getErrors().isEmpty()) {
            return response.getErrors().toString();
        }
        return "Unknown error occurred";
    }
}
