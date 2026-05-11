package com.aibizarchitect.nexus.v1.spring.user.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.aibizarchitect.nexus.v1.user.UserRegistrationDTO;
import com.aibizarchitect.nexus.v1.spring.user.model.UserRegistration;

class UserRegistrationModelTest {

    @Test
    void userRegistration_WithValidData_ShouldSetAndGetPropertiesCorrectly() {
        // Given
        UserRegistration user = new UserRegistration();

        // When
        user.setId(123L);
        user.setAlias("testuser");
        user.setEmail("test@example.com");
        user.setAdmin(true);

        // Then
        assertEquals(Long.valueOf(123L), user.getId());
        assertEquals("testuser", user.getAlias());
        assertEquals("test@example.com", user.getEmail());
        assertTrue(user.isAdmin());
    }

    @Test
    void userRegistration_WithConstructor_ShouldInitializeCorrectly() {
        // When
        UserRegistration user = new UserRegistration("testuser", "test@example.com");

        // Then
        assertEquals("testuser", user.getAlias());
        assertEquals("test@example.com", user.getEmail());
    }

    @Test
    void userRegistration_ToDto_ShouldConvertCorrectly() {
        // Given
        UserRegistration user = new UserRegistration();
        user.setId(456L);
        user.setAlias("dtoUser");
        user.setEmail("dto@example.com");
        user.setAdmin(true);

        // When
        UserRegistrationDTO dto = user.toDTO();

        // Then
        assertNotNull(dto);
        assertEquals("456", dto.getId()); // ID should be converted to String
        assertEquals("dtoUser", dto.getAlias());
        assertEquals("dto@example.com", dto.getEmail());
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
