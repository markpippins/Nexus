package com.aibizarchitect.nexus.v1.broker.api;

import java.io.Serializable;
import java.util.Map;

public class ServiceRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    private String service;
    private String operation;
    private Map<String, Object> params;
    private String requestId;
    private boolean encrypt;

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

    public boolean isEncrypt() {
        return encrypt;
    }

    public void setEncrypt(boolean encrypt) {
        this.encrypt = encrypt;
    }
}
