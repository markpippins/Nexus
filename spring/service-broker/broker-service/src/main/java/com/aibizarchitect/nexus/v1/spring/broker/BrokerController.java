package com.aibizarchitect.nexus.v1.spring.broker;

import java.time.Duration;
import java.time.Instant;
import java.util.Collections;
import java.util.Objects;
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

import com.aibizarchitect.nexus.v1.broker.api.BrokerTrafficEvent;
import com.aibizarchitect.nexus.v1.broker.api.BrokerTrafficPublisher;
import com.aibizarchitect.nexus.v1.broker.api.ServiceRequest;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponseBody;


@CrossOrigin(originPatterns = "*", allowedHeaders = "*", allowCredentials = "true", methods = { RequestMethod.GET,
        RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE, RequestMethod.OPTIONS })
@RestController
@RequestMapping("/api/v1/broker")
public class BrokerController {

    private static final Logger log = LoggerFactory.getLogger(BrokerController.class);
    private static final String LOG_SOURCE = "BrokerController.submitRequest";

    private final Broker broker;
    private final BrokerTrafficPublisher brokerTrafficPublisher;

    public BrokerController(Broker broker, BrokerTrafficPublisher brokerTrafficPublisher) {
        this.broker = broker;
        this.brokerTrafficPublisher = brokerTrafficPublisher;
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

    @PostMapping(value = "/submitRequest", consumes = { "application/json" })
    public ResponseEntity<ServiceResponseBody> submitRequest(
            @RequestBody(required = false) ServiceRequest v1Request) {
        log.debug("Received request: {}", v1Request);
        Instant start = Instant.now();
        ServiceRequest legacyRequest = null;
        ServiceResponse<?> legacyResponse = null;

        try {
            if (v1Request == null) {
                legacyResponse = ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("code", "invalid_request", "message", "Request body is null")),
                        "null");
                ServiceResponseBody response = ServiceResponseBody.fromLegacy(legacyResponse);
                publishTrafficEvent(start, null, legacyResponse, response.isOk(), 400, null);
                return ResponseEntity.badRequest().body(response);
            }

            legacyRequest = new ServiceRequest(
                    v1Request.getService(),
                    v1Request.getOperation(),
                    v1Request.getParams(),
                    v1Request.getRequestId());

            if (Objects.nonNull(v1Request.isEncrypt()) && v1Request.isEncrypt()) {
                legacyRequest.setEncrypt(v1Request.isEncrypt());
            }

            legacyResponse = broker.submit(legacyRequest);

            ServiceResponseBody response = ServiceResponseBody.fromLegacy(legacyResponse);
            int httpStatus = response.isOk() ? 200 : 400;
            publishTrafficEvent(start, legacyRequest, legacyResponse, response.isOk(), httpStatus, null);

            log.debug("Returning: {}", response);

            if (response.isOk()) {
                return ResponseEntity.ok(response);
            } else {
                return ResponseEntity.badRequest().body(response);
            }
        } catch (RuntimeException e) {
            publishTrafficEvent(start, legacyRequest != null ? legacyRequest : v1Request, legacyResponse, false, 500, e.getMessage());
            throw e;
        }
    }

    private void publishTrafficEvent(
            Instant start,
            ServiceRequest request,
            ServiceResponse<?> response,
            boolean ok,
            int httpStatus,
            String errorMessage) {
        String requestId = request != null ? request.getRequestId() : (response != null ? response.getRequestId() : null);
        String service = request != null ? request.getService() : (response != null ? response.getService() : null);
        String operation = request != null ? request.getOperation() : (response != null ? response.getOperation() : null);
        long durationMs = Math.max(0L, Duration.between(start, Instant.now()).toMillis());

        brokerTrafficPublisher.publish(new BrokerTrafficEvent(
                UUID.randomUUID().toString(),
                Instant.now().toString(),
                durationMs,
                requestId,
                service,
                operation,
                ok,
                httpStatus,
                LOG_SOURCE,
                request,
                response,
                errorMessage));

        }
    }