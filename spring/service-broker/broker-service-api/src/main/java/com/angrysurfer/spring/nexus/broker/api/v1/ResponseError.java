package com.angrysurfer.spring.nexus.broker.api.v1;

import java.io.Serializable;

/**
 * Error detail structure for failed responses.
 * Aligned with TypeSpec Broker Service API definition.
 */
public class ResponseError implements Serializable {

    private static final long serialVersionUID = 1L;

    private String field;
    private String message;

    public ResponseError() {
    }

    public ResponseError(String field, String message) {
        this.field = field;
        this.message = message;
    }

    public String getField() {
        return field;
    }

    public void setField(String field) {
        this.field = field;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
