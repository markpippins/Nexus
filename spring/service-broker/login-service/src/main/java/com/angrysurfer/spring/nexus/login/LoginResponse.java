package com.angrysurfer.spring.nexus.login;

import java.util.HashMap;
import java.util.Map;

import lombok.Data;

@Data
public class LoginResponse {

    private String userId;
    private String token;
    private String status;
    private String message;
    private boolean ok = false;
    private boolean admin = false;
    private Map<String, String> errors = new HashMap<>();

    public LoginResponse() {
    }

    // Constructor for successful login (with token)
    public LoginResponse(String token, String userId, boolean admin) {
        this.token = token;
        this.userId = userId;
        this.admin = admin;
        this.ok = true;
        this.status = "SUCCESS";
    }

    // Constructor for failed login (with status and message, no token)
    public LoginResponse(String status, String message) {
        this.status = status;
        this.message = message;
        this.ok = false;
    }

    public void addError(String field, String message) {
        errors.put(field, message);
    }

    public void clearErrors() {
        errors.clear();
    }
}