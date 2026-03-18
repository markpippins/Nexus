package com.angrysurfer.spring.nexus.login;

import org.junit.jupiter.api.Test;

import com.angrysurfer.spring.nexus.login.LoginResponse;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class LoginResponseTest {

    @Test
    void loginResponse_WithDefaultConstructor_ShouldInitializeCorrectly() {
        // When
        LoginResponse response = new LoginResponse();

        // Then
        assertNull(response.getUserId());
        assertNull(response.getAvatarUrl());
        assertNull(response.getToken());
        assertNull(response.getMessage());
        assertFalse(response.isOk());
        assertFalse(response.isAdmin());
        assertNotNull(response.getErrors());
        assertTrue(response.getErrors().isEmpty());
    }

    @Test
    void loginResponse_WithTokenOnly_ShouldInitializeCorrectly() {
        // When
        LoginResponse response = new LoginResponse(); // Use default constructor
        response.setToken("test-token"); // Set token manually

        // Then
        assertNull(response.getUserId());
        assertNull(response.getAvatarUrl());
        assertEquals("test-token", response.getToken());
        assertNull(response.getMessage());
        assertFalse(response.isOk()); // Still false because it wasn't set via success constructor
        assertFalse(response.isAdmin());
        assertNotNull(response.getErrors());
        assertTrue(response.getErrors().isEmpty());
    }

    @Test
    void loginResponse_WithStatusAndMessageConstructor_ShouldInitializeCorrectly() {
        // When
        LoginResponse response = new LoginResponse("ERROR", "test message");

        // Then
        assertNull(response.getUserId());
        assertNull(response.getAvatarUrl());
        assertNull(response.getToken()); // Token is not set with this constructor
        assertEquals("ERROR", response.getStatus()); // Status is set, not token
        assertEquals("test message", response.getMessage());
        assertFalse(response.isOk());
        assertFalse(response.isAdmin());
        assertNotNull(response.getErrors());
        assertTrue(response.getErrors().isEmpty());
    }

    @Test
    void loginResponse_SettersAndGetters_ShouldWorkCorrectly() {
        // Given
        LoginResponse response = new LoginResponse();

        // When
        response.setUserId("123");
        response.setAvatarUrl("https://example.com/avatar.jpg");
        response.setToken("test-token");
        response.setMessage("test message");
        response.setOk(true);
        response.setAdmin(true);

        // Then
        assertEquals("123", response.getUserId());
        assertEquals("https://example.com/avatar.jpg", response.getAvatarUrl());
        assertEquals("test-token", response.getToken());
        assertEquals("test message", response.getMessage());
        assertTrue(response.isOk());
        assertTrue(response.isAdmin());
    }

    @Test
    void loginResponse_AddError_ShouldAddToErrorsMap() {
        // Given
        LoginResponse response = new LoginResponse();

        // When
        response.addError("field1", "error message 1");
        response.addError("field2", "error message 2");

        // Then
        Map<String, String> errors = response.getErrors();
        assertEquals(2, errors.size());
        assertEquals("error message 1", errors.get("field1"));
        assertEquals("error message 2", errors.get("field2"));
    }

    @Test
    void loginResponse_ClearErrors_ShouldEmptyErrorsMap() {
        // Given
        LoginResponse response = new LoginResponse();
        response.addError("field1", "error message 1");

        // When
        response.clearErrors();

        // Then
        assertTrue(response.getErrors().isEmpty());
    }

    @Test
    void loginResponse_InitialOkValue_ShouldBeFalse() {
        // When
        LoginResponse response = new LoginResponse();

        // Then
        assertFalse(response.isOk());
    }

    @Test
    void loginResponse_InitialAdminValue_ShouldBeFalse() {
        // When
        LoginResponse response = new LoginResponse();

        // Then
        assertFalse(response.isAdmin());
    }
}