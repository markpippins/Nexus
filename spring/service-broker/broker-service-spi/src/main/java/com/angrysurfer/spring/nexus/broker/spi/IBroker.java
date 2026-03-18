package com.angrysurfer.spring.nexus.broker.spi;

import com.angrysurfer.spring.nexus.broker.api.ServiceRequest;
import com.angrysurfer.spring.nexus.broker.api.ServiceResponse;

public interface IBroker {
    <T> ServiceResponse<T> submit(ServiceRequest request);
}
