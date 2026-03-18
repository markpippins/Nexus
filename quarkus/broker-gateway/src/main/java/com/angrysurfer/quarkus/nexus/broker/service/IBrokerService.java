package com.angrysurfer.quarkus.nexus.broker.service;

import com.angrysurfer.spring.nexus.broker.api.ServiceRequest;
import com.angrysurfer.spring.nexus.broker.api.ServiceResponse;

import jakarta.ws.rs.core.Response;

public interface IBrokerService {
    ServiceResponse<?> submit(ServiceRequest request);

    Response healthCheck();
}
