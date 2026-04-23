package com.angrysurfer.quarkus.nexus.broker.service;

import com.aibizarchitect.nexus.v1.broker.api.ServiceRequest;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;

import jakarta.ws.rs.core.Response;

public interface IBrokerService {
    ServiceResponse<?> submit(ServiceRequest request);

    Response healthCheck();
}
