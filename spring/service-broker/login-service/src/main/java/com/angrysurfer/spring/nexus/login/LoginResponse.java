package com.angrysurfer.spring.nexus.login;

import java.util.HashMap;
import java.util.Map;

import lombok.Data;

@Data
public class LoginResponse {

    private String userId;
    private String avatarUrl;
    private String token;
    private String status; // Add status field
    private String message;
    private boolean ok = false;
    private boolean admin = false;
    private Map<String, String> errors = new HashMap<>();

    public LoginResponse() {
    }
    
    // Constructor for successful login (with token)
    public LoginResponse(String token, String userId, String avatarUrl, boolean admin) {
        this.token = token;
        this.userId = userId;
        this.avatarUrl = avatarUrl;
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

    // Removed the problematic constructor `public LoginResponse(String token, String message)`

    public void addError(String field, String message) {
        errors.put(field, message);
    }

    public void clearErrors() {
        errors.clear();
    }
}