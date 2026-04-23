package com.angrysurfer.quarkus.nexus.broker.service;

import java.util.HashMap;
import java.util.Map;

import com.aibizarchitect.nexus.v1.broker.api.ServiceRequest;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.core.Response;

@ApplicationScoped
public class QuarkusBrokerService implements IBrokerService {

    @Override
    public ServiceResponse<?> submit(ServiceRequest request) {
        try {
            // For now, return a simple response with the request data
            // In the future, this would route to actual services
            Map<String, Object> result = new HashMap<>();
            result.put("service", request.getService());
            result.put("operation", request.getOperation());
            result.put("params", request.getParams());
            result.put("requestId", request.getRequestId());
            result.put("status", "processed");
            result.put("timestamp", System.currentTimeMillis());

            return ServiceResponse.ok(request.getService(), request.getOperation(), result, request.getRequestId());
        } catch (Exception e) {
            // Create error response with the original request ID if available
            String requestId = request != null ? request.getRequestId() : "unknown";
            ServiceResponse<Object> errorResponse = new ServiceResponse<>();
            errorResponse.setOk(false);
            errorResponse.setRequestId(requestId);
            errorResponse.addError("exception", e.getMessage());
            return errorResponse;
        }
    }

    @Override
    public Response healthCheck() {
        Map<String, String> health = new HashMap<>();
        health.put("status", "UP");
        health.put("service", "quarkus-broker-gateway");
        health.put("port", "8090");

        return Response.ok(health).build();
    }
}
