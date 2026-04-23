package com.aibizarchitect.nexus.v1.spring.broker.spi;

import com.aibizarchitect.nexus.v1.broker.api.ServiceRequest;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;

public interface IBroker {
    <T> ServiceResponse<T> submit(ServiceRequest request);
}
