package com.angrysurfer.spring.nexus.user.model;

import com.angrysurfer.spring.nexus.user.UserRegistrationDTO;
import com.angrysurfer.spring.nexus.user.model.UserRegistration;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class UserRegistrationModelTest {

    @Test
    void userRegistration_WithValidData_ShouldSetAndGetPropertiesCorrectly() {
        // Given
        UserRegistration user = new UserRegistration();

        // When
        user.setId(123L);
        user.setAlias("testuser");
        user.setEmail("test@example.com");
        user.setIdentifier("password123");
        user.setAvatarUrl("https://example.com/avatar.jpg");
        user.setAdmin(true);

        // Then
        assertEquals(Long.valueOf(123L), user.getId());
        assertEquals("testuser", user.getAlias());
        assertEquals("test@example.com", user.getEmail());
        assertEquals("password123", user.getIdentifier());
        assertEquals("https://example.com/avatar.jpg", user.getAvatarUrl());
        assertTrue(user.isAdmin());
    }

    @Test
    void userRegistration_WithConstructor_ShouldInitializeCorrectly() {
        // When
        UserRegistration user = new UserRegistration("testuser", "test@example.com", "https://example.com/avatar.jpg");

        // Then
        assertEquals("testuser", user.getAlias());
        assertEquals("test@example.com", user.getEmail());
        assertEquals("https://example.com/avatar.jpg", user.getAvatarUrl());
    }

    @Test
    void userRegistration_WithConstructorAndIdentifier_ShouldInitializeCorrectly() {
        // When
        UserRegistration user = new UserRegistration("testuser", "test@example.com", "https://example.com/avatar.jpg",
                "password123");

        // Then
        assertEquals("testuser", user.getAlias());
        assertEquals("test@example.com", user.getEmail());
        assertEquals("https://example.com/avatar.jpg", user.getAvatarUrl());
        assertEquals("password123", user.getIdentifier());
    }

    @Test
    void userRegistration_ToDto_ShouldConvertCorrectly() {
        // Given
        UserRegistration user = new UserRegistration();
        user.setId(456L);
        user.setAlias("dtoUser");
        user.setEmail("dto@example.com");
        user.setIdentifier("dtoPassword");
        user.setAvatarUrl("https://example.com/dto.jpg");
        user.setAdmin(true);

        // When
        UserRegistrationDTO dto = user.toDTO();

        // Then
        assertNotNull(dto);
        assertEquals("456", dto.getId()); // ID should be converted to String
        assertEquals("dtoUser", dto.getAlias());
        assertEquals("dto@example.com", dto.getEmail());
        assertEquals("dtoPassword", dto.getIdentifier());
        assertEquals("https://example.com/dto.jpg", dto.getAvatarUrl());
        assertTrue(dto.isAdmin());
    }

    @Test
    void userRegistration_ToDto_WithNullId_ShouldHandleGracefully() {
        // Given
        UserRegistration user = new UserRegistration();
        user.setAlias("dtoUser");
        user.setEmail("dto@example.com");

        // When
        UserRegistrationDTO dto = user.toDTO();

        // Then
        assertNotNull(dto);
        assertNull(dto.getId()); // Should be null when user ID is null
        assertEquals("dtoUser", dto.getAlias());
        assertEquals("dto@example.com", dto.getEmail());
    }
}