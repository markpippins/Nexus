package com.aibizarchitect.nexus.v1.broker.api;

import java.io.Serializable;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The response body returned by broker service operations.
 */
public class ServiceResponseBody implements Serializable {

    private static final long serialVersionUID = 1L;

    private boolean ok;
    private Object data;
    private List<ResponseError> errors;
    private String requestId;
    private Instant ts;
    private String version;
    private String service;
    private String operation;
    private Boolean encrypt;

    public ServiceResponseBody() {
    }

    public ServiceResponseBody(boolean ok, String requestId, Instant ts) {
        this.ok = ok;
        this.requestId = requestId;
        this.ts = ts;
    }

    public static ServiceResponseBody ok(String service, String operation, Object data, String requestId) {
        ServiceResponseBody response = new ServiceResponseBody(true, requestId, Instant.now());
        response.setData(data);
        response.setService(service);
        response.setOperation(operation);
        return response;
    }

    public static ServiceResponseBody error(String service, String operation, List<ResponseError> errors,
            String requestId) {
        ServiceResponseBody response = new ServiceResponseBody(false, requestId, Instant.now());
        response.setErrors(errors);
        response.setService(service);
        response.setOperation(operation);
        return response;
    }

    public static ServiceResponseBody error(List<ResponseError> errors, String requestId) {
        ServiceResponseBody response = new ServiceResponseBody(false, requestId, Instant.now());
        response.setErrors(errors);
        return response;
    }

    public boolean isOk() {
        return ok;
    }

    public void setOk(boolean ok) {
        this.ok = ok;
    }

    public Object getData() {
        return data;
    }

    public void setData(Object data) {
        this.data = data;
    }

    public List<ResponseError> getErrors() {
        return errors;
    }

    public void setErrors(List<ResponseError> errors) {
        this.errors = errors;
    }

    public String getRequestId() {
        return requestId;
    }

    public void setRequestId(String requestId) {
        this.requestId = requestId;
    }

    public Instant getTs() {
        return ts;
    }

    public void setTs(Instant ts) {
        this.ts = ts;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
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

    public Boolean isEncrypt() {
        return encrypt;
    }

    public void setEncrypt(Boolean encrypt) {
        this.encrypt = encrypt;
    }

    public void addError(String field, String message) {
        if (this.errors == null) {
            this.errors = new ArrayList<>();
        }
        this.errors.add(new ResponseError(field, message));
        this.ok = false;
    }

    @SuppressWarnings("unchecked")
    public static ServiceResponseBody fromLegacy(ServiceResponse<?> legacy) {
        ServiceResponseBody v1 = new ServiceResponseBody();
        v1.setOk(legacy.isOk());
        v1.setData(legacy.getData());
        v1.setRequestId(legacy.getRequestId());
        v1.setTs(legacy.getTs());
        v1.setVersion(legacy.getVersion());
        v1.setService(legacy.getService());
        v1.setOperation(legacy.getOperation());
        v1.setEncrypt(legacy.isEncrypt());

        if (legacy.getErrors() != null && !legacy.getErrors().isEmpty()) {
            List<ResponseError> v1Errors = new ArrayList<>();
            for (Map<String, Object> error : (List<Map<String, Object>>) legacy.getErrors()) {
                String field = error.containsKey("field") ? (String) error.get("field") : "";
                String message = error.containsKey("message") ? (String) error.get("message") : error.toString();
                v1Errors.add(new ResponseError(field, message));
            }
            v1.setErrors(v1Errors);
        }

        return v1;
    }

    public ServiceResponse<Object> toLegacy() {
        ServiceResponse<Object> legacy = new ServiceResponse<>();
        legacy.setOk(this.ok);
        legacy.setData(this.data);
        legacy.setRequestId(this.requestId);
        legacy.setTs(this.ts);
        legacy.setVersion(this.version);
        legacy.setService(this.service);
        legacy.setOperation(this.operation);
        legacy.setEncrypt(this.encrypt != null ? this.encrypt : false);

        if (this.errors != null && !this.errors.isEmpty()) {
            List<Map<String, Object>> legacyErrors = new ArrayList<>();
            for (ResponseError error : this.errors) {
                legacyErrors.add(Map.of("field", error.getField(), "message", error.getMessage()));
            }
            legacy.setErrors(legacyErrors);
        }

        return legacy;
    }
}
