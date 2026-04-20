package com.aibizarchitect.nexus.core;

import java.util.List;

public class ServiceResponseBody {
    private boolean ok;
    private BinaryData data;
    private List<ResponseError> errors;
    private String requestId;
    private String ts;
    private String version;
    private String service;
    private String operation;
    private Boolean encrypt;
    public ServiceResponseBody() {}
    public ServiceResponseBody(boolean ok, String requestId, String ts) {
        this.ok = ok; this.requestId = requestId; this.ts = ts;
    }
    public boolean isOk() { return ok; }
    public void setOk(boolean ok) { this.ok = ok; }
    public BinaryData getData() { return data; }
    public void setData(BinaryData data) { this.data = data; }
    public List<ResponseError> getErrors() { return errors; }
    public void setErrors(List<ResponseError> errors) { this.errors = errors; }
    public String getRequestId() { return requestId; }
    public void setRequestId(String requestId) { this.requestId = requestId; }
    public String getTs() { return ts; }
    public void setTs(String ts) { this.ts = ts; }
    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }
    public String getService() { return service; }
    public void setService(String service) { this.service = service; }
    public String getOperation() { return operation; }
    public void setOperation(String operation) { this.operation = operation; }
    public Boolean getEncrypt() { return encrypt; }
    public void setEncrypt(Boolean encrypt) { this.encrypt = encrypt; }
}
