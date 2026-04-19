package com.aibizarchitect.nexus.core.v1;

import java.util.Map;

/** Canonical service request. */
public class ServiceRequest {
    private String service;
    private String operation;
    private Map<String, BinaryData> params;
    private String requestId;
    private Boolean encrypt;

    public ServiceRequest() {}
    public ServiceRequest(String service, String operation, Map<String, BinaryData> params, String requestId) {
        this.service = service;
        this.operation = operation;
        this.params = params;
        this.requestId = requestId;
    }
    public String getService() { return service; }
    public void setService(String service) { this.service = service; }
    public String getOperation() { return operation; }
    public void setOperation(String operation) { this.operation = operation; }
    public Map<String, BinaryData> getParams() { return params; }
    public void setParams(Map<String, BinaryData> params) { this.params = params; }
    public String getRequestId() { return requestId; }
    public void setRequestId(String requestId) { this.requestId = requestId; }
    public Boolean getEncrypt() { return encrypt; }
    public void setEncrypt(Boolean encrypt) { this.encrypt = encrypt; }
}
