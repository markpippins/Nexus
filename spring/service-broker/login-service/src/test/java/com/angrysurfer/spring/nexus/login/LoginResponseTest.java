package com.angrysurfer.spring.nexus.login;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;

import org.junit.jupiter.api.Test;

class LoginResponseTest {

    @Test
    void loginResponse_WithDefaultConstructor_ShouldInitializeCorrectly() {
        // When
        LoginResponse response = new LoginResponse();

        // Then
        assertNull(response.getUserId());
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
        response.setToken("test-token");
        response.setMessage("test message");
        response.setOk(true);
        response.setAdmin(true);

        // Then
        assertEquals("123", response.getUserId());
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