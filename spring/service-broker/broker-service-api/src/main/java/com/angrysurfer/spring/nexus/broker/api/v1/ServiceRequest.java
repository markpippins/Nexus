package com.angrysurfer.spring.nexus.broker.api.v1;

import java.io.Serializable;
import java.util.Map;

/**
 * A request submitted to the service broker for processing.
 * Aligned with TypeSpec Broker Service API definition.
 */
public class ServiceRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * The target service name to invoke.
     */
    private String service;

    /**
     * The operation name to execute on the target service.
     */
    private String operation;

    /**
     * Parameters to pass to the operation.
     */
    private Map<String, Object> params;

    /**
     * Unique identifier for tracking this request.
     */
    private String requestId;

    /**
     * Whether the request/response should be encrypted.
     */
    private Boolean encrypt;

    public ServiceRequest() {
    }

    public ServiceRequest(String service, String operation, Map<String, Object> params, String requestId) {
        this.service = service;
        this.operation = operation;
        this.params = params;
        this.requestId = requestId;
    }

    public String getService() {
        return service;
    }

    public void setService(String service) {
        this.service = service;
    }

    public String getOperation() {
        return operation;
    }

    public void setOperation(String operation) {
        this.operation = operation;
    }

    public Map<String, Object> getParams() {
        return params;
    }

    public void setParams(Map<String, Object> params) {
        this.params = params;
    }

    public String getRequestId() {
        return requestId;
    }

    public void setRequestId(String requestId) {
        this.requestId = requestId;
    }

    public Boolean isEncrypt() {
        return encrypt;
    }

    public void setEncrypt(Boolean encrypt) {
        this.encrypt = encrypt;
    }
}
