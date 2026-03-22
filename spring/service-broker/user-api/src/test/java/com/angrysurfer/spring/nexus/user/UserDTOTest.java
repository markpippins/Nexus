package com.angrysurfer.spring.nexus.user;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Tests for simplified UserDTO.
 * Note: Social media fields (followers, following, friends, etc.) removed - deprecated.
 */
class UserDTOTest {

    private UserDTO userDTO;

    @BeforeEach
    void setUp() {
        userDTO = new UserDTO();
    }

    @Test
    void testId() {
        String expectedId = "123";
        userDTO.setId(expectedId);

        assertEquals(expectedId, userDTO.getId());
    }

    @Test
    void testAlias() {
        String expectedAlias = "testUser";
        userDTO.setAlias(expectedAlias);

        assertEquals(expectedAlias, userDTO.getAlias());
    }

    @Test
    void testEmail() {
        String expectedEmail = "test@example.com";
        userDTO.setEmail(expectedEmail);

        assertEquals(expectedEmail, userDTO.getEmail());
    }

    @Test
    void testAvatarUrl() {
        String expectedAvatarUrl = "https://example.com/avatar.jpg";
        userDTO.setAvatarUrl(expectedAvatarUrl);

        assertEquals(expectedAvatarUrl, userDTO.getAvatarUrl());
    }

    @Test
    void testAdmin() {
        assertFalse(userDTO.isAdmin());
        userDTO.setAdmin(true);
        assertTrue(userDTO.isAdmin());
    }

    @Test
    void testDefaultValues() {
        UserDTO dto = new UserDTO();

        // Test default values
        assertNull(dto.getId());
        assertNull(dto.getAlias());
        assertNull(dto.getEmail());
        assertNull(dto.getAvatarUrl());
        assertFalse(dto.isAdmin());
    }

    @Test
    void testEqualsAndHashCode() {
        UserDTO dto1 = new UserDTO();
        dto1.setId("123");
        dto1.setAlias("testUser");

        UserDTO dto2 = new UserDTO();
        dto2.setId("123");
        dto2.setAlias("testUser");

        assertEquals(dto1, dto2);
        assertEquals(dto1.hashCode(), dto2.hashCode());
    }

    @Test
    void testSerialization() {
        // Verify DTO is serializable
        userDTO.setId("123");
        userDTO.setAlias("testUser");
        userDTO.setEmail("test@example.com");

        assertNotNull(userDTO);
    }
}
