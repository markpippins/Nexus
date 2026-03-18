package com.angrysurfer.spring.nexus.user.integration;

import com.angrysurfer.spring.nexus.user.UserRegistrationDTO;
import com.angrysurfer.spring.nexus.user.model.UserRegistration;
import com.angrysurfer.spring.nexus.user.repository.UserRegistrationRepository;
import com.angrysurfer.spring.nexus.user.service.UserAccessService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for User Access Service.
 * Uses MySQL container for database testing.
 */
@ExtendWith(SpringExtension.class)
@SpringBootTest
@Testcontainers
class UserAccessServiceIntegrationTest {

    @Container
    static MySQLContainer<?> mysqlContainer = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("testdb")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", mysqlContainer::getJdbcUrl);
        registry.add("spring.datasource.username", mysqlContainer::getUsername);
        registry.add("spring.datasource.password", mysqlContainer::getPassword);
    }

    @Autowired
    private UserRegistrationRepository userRepository;

    @Autowired
    private UserAccessService userAccessService;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();
    }

    @Test
    void validateUser_WithValidUserInDatabase_ShouldReturnUserDto() {
        // Given
        UserRegistration user = new UserRegistration();
        user.setAlias("testuser");
        user.setIdentifier("password123");
        user.setEmail("test@example.com");
        user.setAvatarUrl("https://example.com/avatar.jpg");
        user.setAdmin(true);
        userRepository.save(user);

        // When
        UserRegistrationDTO result = userAccessService.validateUser("testuser", "password123");

        // Then
        assertNotNull(result);
        assertEquals("testuser", result.getAlias());
        assertEquals("test@example.com", result.getEmail());
        assertEquals("https://example.com/avatar.jpg", result.getAvatarUrl());
        assertTrue(result.isAdmin());
    }

    @Test
    void validateUser_WithWrongPassword_ShouldReturnNull() {
        // Given
        UserRegistration user = new UserRegistration();
        user.setAlias("testuser");
        user.setIdentifier("correctPassword");
        user.setEmail("test@example.com");
        userRepository.save(user);

        // When
        UserRegistrationDTO result = userAccessService.validateUser("testuser", "wrongPassword");

        // Then
        assertNull(result);
    }

    @Test
    void validateUser_WithNonExistentUser_ShouldReturnNull() {
        // When
        UserRegistrationDTO result = userAccessService.validateUser("nonexistent", "password");

        // Then
        assertNull(result);
    }

    @Test
    void validateUser_WithUserInDatabase_ShouldReturnCorrectly() {
        // Given
        UserRegistration user = new UserRegistration();
        user.setAlias("integrationTestUser");
        user.setIdentifier("integrationPassword");
        user.setEmail("integration@test.com");
        user.setAvatarUrl("https://example.com/integration.jpg");
        user.setAdmin(false);
        UserRegistration savedUser = userRepository.save(user);

        // When
        UserRegistrationDTO result = userAccessService.validateUser("integrationTestUser", "integrationPassword");

        // Then
        assertNotNull(result);
        assertEquals("integrationTestUser", result.getAlias());
        assertEquals("integration@test.com", result.getEmail());
        assertEquals("https://example.com/integration.jpg", result.getAvatarUrl());
        assertFalse(result.isAdmin());
        assertNotNull(result.getId()); // ID should be set
    }
}
