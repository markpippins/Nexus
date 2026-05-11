package com.aibizarchitect.nexus.v1.spring.user.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

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

import com.aibizarchitect.nexus.v1.user.UserRegistrationDTO;
import com.aibizarchitect.nexus.v1.spring.user.model.UserRegistration;
import com.aibizarchitect.nexus.v1.spring.user.repository.UserRegistrationRepository;
import com.aibizarchitect.nexus.v1.spring.user.service.UserAccessService;
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
        user.setEmail("test@example.com");
        user.setAdmin(true);
        userRepository.save(user);

        // When
        UserRegistrationDTO result = userAccessService.validateUser("testuser", "ignored");

        // Then
        assertNotNull(result);
        assertEquals("testuser", result.getAlias());
        assertEquals("test@example.com", result.getEmail());
        assertTrue(result.isAdmin());
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
        user.setEmail("integration@test.com");
        user.setAdmin(false);
        UserRegistration savedUser = userRepository.save(user);

        // When
        UserRegistrationDTO result = userAccessService.validateUser("integrationTestUser", "ignored");

        // Then
        assertNotNull(result);
        assertEquals("integrationTestUser", result.getAlias());
        assertEquals("integration@test.com", result.getEmail());
        assertFalse(result.isAdmin());
        assertNotNull(result.getId()); // ID should be set
    }
}
