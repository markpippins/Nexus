package com.aibizarchitect.nexus.v1.spring.usercreation;

import com.aibizarchitect.nexus.v1.spring.user.model.UserRegistration;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * REST controller for user creation.
 * Endpoint: POST /api/v1/users
 */
@RestController
@RequestMapping("/api/v1/users")
@CrossOrigin(origins = "*")
public class UserCreationController {

    private final UserCreationService service;

    public UserCreationController(UserCreationService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<UserRegistration> createUser(@RequestBody Map<String, String> body) {
        String alias = body.get("alias");
        String email = body.get("email");
        String identifier = body.get("identifier");
        boolean admin = Boolean.parseBoolean(body.getOrDefault("admin", "false"));

        if (alias == null || alias.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        if (identifier == null || identifier.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        try {
            UserRegistration user = service.createUser(alias, email, identifier, admin);
            return ResponseEntity.status(201).body(user);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }
}
