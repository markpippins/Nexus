package com.aibizarchitect.nexus.v1.spring.user.e2e;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

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
 * End-to-end tests for User Access Service.
 * Uses MySQL container for database testing.
 */
@ExtendWith(SpringExtension.class)
@SpringBootTest
@Testcontainers
class UserAccessServiceE2ETest {

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
    void userRegistrationAndValidationE2E() {
        // Scenario: Complete end-to-end flow of user registration and validation

        // Step 1: Create and save a user (simulating user registration)
        UserRegistration newUser = new UserRegistration();
        newUser.setAlias("e2eTestUser");
        newUser.setEmail("e2e@test.com");
        newUser.setAdmin(false);

        // Save the user to the database
        UserRegistration savedUser = userRepository.save(newUser);

        // Verify the user was saved correctly
        assertNotNull(savedUser.getId());
        assertEquals("e2eTestUser", savedUser.getAlias());
        assertEquals("e2e@test.com", savedUser.getEmail());

        // Step 2: Validate the user using the service
        UserRegistrationDTO validatedUser = userAccessService.validateUser("e2eTestUser", "ignored");

        // Verify the validation returned correct user data
        assertNotNull(validatedUser);
        assertEquals("e2eTestUser", validatedUser.getAlias());
        assertEquals("e2e@test.com", validatedUser.getEmail());
        assertFalse(validatedUser.isAdmin());

        // Step 3: Verify that non-existent user returns null
        UserRegistrationDTO nonExistentResult = userAccessService.validateUser("nonExistentUser", "anyPassword");
        assertNull(nonExistentResult);
    }

    @Test
    void multipleUserRegistrationAndValidationE2E() {
        // Scenario: Register multiple users and validate them

        // Step 1: Register multiple users
        UserRegistration user1 = new UserRegistration();
        user1.setAlias("user1");
        user1.setEmail("user1@test.com");
        userRepository.save(user1);

        UserRegistration user2 = new UserRegistration();
        user2.setAlias("user2");
        user2.setEmail("user2@test.com");
        userRepository.save(user2);

        UserRegistration user3 = new UserRegistration();
        user3.setAlias("user3");
        user3.setEmail("user3@test.com");
        userRepository.save(user3);

        // Step 2: Validate each user individually
        UserRegistrationDTO result1 = userAccessService.validateUser("user1", "ignored");
        UserRegistrationDTO result2 = userAccessService.validateUser("user2", "ignored");
        UserRegistrationDTO result3 = userAccessService.validateUser("user3", "ignored");

        // Verify all users were validated correctly
        assertNotNull(result1);
        assertEquals("user1", result1.getAlias());
        assertEquals("user1@test.com", result1.getEmail());

        assertNotNull(result2);
        assertEquals("user2", result2.getAlias());
        assertEquals("user2@test.com", result2.getEmail());

        assertNotNull(result3);
        assertEquals("user3", result3.getAlias());
        assertEquals("user3@test.com", result3.getEmail());
    }

    @Test
    void userUpdateAndValidationE2E() {
        // Scenario: Update a user and verify the updated information is used for
        // validation

        // Step 1: Create and save initial user
        UserRegistration user = new UserRegistration();
        user.setAlias("updateTestUser");
        user.setEmail("initial@test.com");
        UserRegistration savedUser = userRepository.save(user);

        // Step 2: Verify initial validation works
        UserRegistrationDTO initialResult = userAccessService.validateUser("updateTestUser", "ignored");
        assertNotNull(initialResult);
        assertEquals("initial@test.com", initialResult.getEmail());

        // Step 3: Update the user's information
        savedUser.setEmail("updated@test.com");
        userRepository.save(savedUser);

        // Step 4: Verify validation works with updated information
        UserRegistrationDTO updatedResult = userAccessService.validateUser("updateTestUser", "ignored");
        assertNotNull(updatedResult);
        assertEquals("updated@test.com", updatedResult.getEmail());
    }
}
