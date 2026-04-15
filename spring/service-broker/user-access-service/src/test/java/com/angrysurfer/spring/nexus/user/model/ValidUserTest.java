package com.angrysurfer.spring.nexus.user.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.angrysurfer.spring.nexus.user.UserRegistrationDTO;

class ValidUserTest {

    private UserRegistration validUser;

    @BeforeEach
    void setUp() {
        validUser = new UserRegistration();
    }

    @Test
    void testConstructorWithParameters() {
        UserRegistration user = new UserRegistration("testAlias", "test@example.com");

        assertEquals("testAlias", user.getAlias());
        assertEquals("test@example.com", user.getEmail());
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
    void testToDTO() {
        // Setup user with data
        validUser.setId(123L);
        validUser.setAlias("testUser");
        validUser.setEmail("test@example.com");

        // Convert to DTO
        UserRegistrationDTO dto = validUser.toDTO();

        // Verify DTO values
        assertEquals("123", dto.getId()); // Long id converted to String
        assertEquals("testUser", dto.getAlias());
        assertEquals("test@example.com", dto.getEmail());
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