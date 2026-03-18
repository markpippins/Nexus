package com.angrysurfer.spring.nexus.user.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ValidUserTest {

    private UserRegistration validUser;

    @BeforeEach
    void setUp() {
        validUser = new UserRegistration();
    }

    @Test
    void testConstructorWithParameters() {
        UserRegistration user = new UserRegistration("testAlias", "test@example.com", "avatar.jpg");

        assertEquals("testAlias", user.getAlias());
        assertEquals("test@example.com", user.getEmail());
        assertEquals("avatar.jpg", user.getAvatarUrl());
    }

    @Test
    void testConstructorWithAllParameters() {
        UserRegistration user = new UserRegistration("testAlias", "test@example.com", "avatar.jpg", "password123");

        assertEquals("testAlias", user.getAlias());
        assertEquals("test@example.com", user.getEmail());
        assertEquals("avatar.jpg", user.getAvatarUrl());
        assertEquals("password123", user.getIdentifier());
    }

    @Test
    void testId() {
        Long expectedId = 123L;
        validUser.setId(expectedId);

        assertEquals(expectedId, validUser.getId());
    }

    @Test
    void testAlias() {
        String expectedAlias = "testAlias";
        validUser.setAlias(expectedAlias);

        assertEquals(expectedAlias, validUser.getAlias());
    }

    @Test
    void testEmail() {
        String expectedEmail = "test@example.com";
        validUser.setEmail(expectedEmail);

        assertEquals(expectedEmail, validUser.getEmail());
    }

    @Test
    void testIdentifier() {
        String expectedIdentifier = "secret123";
        validUser.setIdentifier(expectedIdentifier);

        assertEquals(expectedIdentifier, validUser.getIdentifier());
    }

    @Test
    void testAvatarUrl() {
        String expectedAvatarUrl = "https://example.com/avatar.jpg";
        validUser.setAvatarUrl(expectedAvatarUrl);

        assertEquals(expectedAvatarUrl, validUser.getAvatarUrl());
    }

    @Test
    void testToDTO() {
        // Setup user with data
        validUser.setId(123L);
        validUser.setAlias("testUser");
        validUser.setEmail("test@example.com");
        validUser.setIdentifier("password");
        validUser.setAvatarUrl("https://example.com/avatar.jpg");

        // Convert to DTO
        com.angrysurfer.spring.nexus.user.UserRegistrationDTO dto = validUser.toDTO();

        // Verify DTO values
        assertEquals("123", dto.getId()); // Long id converted to String
        assertEquals("testUser", dto.getAlias());
        assertEquals("test@example.com", dto.getEmail());
        assertEquals("password", dto.getIdentifier());
        assertEquals("https://example.com/avatar.jpg", dto.getAvatarUrl());
    }

    @Test
    void testSerialVersionUID() throws NoSuchFieldException, IllegalAccessException {
        // Get the serialVersionUID from the class
        java.lang.reflect.Field serialVersionUIDField = UserRegistration.class.getDeclaredField("serialVersionUID");
        serialVersionUIDField.setAccessible(true);
        long serialVersionUID = (long) serialVersionUIDField.get(null);

        assertEquals(2747813660378401172L, serialVersionUID);
    }
}