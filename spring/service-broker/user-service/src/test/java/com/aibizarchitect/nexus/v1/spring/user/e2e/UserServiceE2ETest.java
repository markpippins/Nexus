package com.aibizarchitect.nexus.v1.spring.user.e2e;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.aibizarchitect.nexus.v1.spring.user.ResourceNotFoundException;
import com.aibizarchitect.nexus.v1.spring.user.TestUserServiceApplication;
import com.aibizarchitect.nexus.v1.spring.user.User;
import com.aibizarchitect.nexus.v1.user.UserDTO;
import com.aibizarchitect.nexus.v1.spring.user.UserRepository;
import com.aibizarchitect.nexus.v1.spring.user.UserService;

@ExtendWith(SpringExtension.class)
@SpringBootTest(classes = TestUserServiceApplication.class)
@Testcontainers
class UserServiceE2ETest {

    @Container
    @SuppressWarnings("resource")
    static MongoDBContainer mongoDBContainer = new MongoDBContainer("mongo:5.0")
            .withExposedPorts(27017);

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.data.mongodb.uri", mongoDBContainer::getReplicaSetUrl);
    }

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserService userService;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();
    }

    @Test
    void userLifecycleE2E() throws ResourceNotFoundException {
        // Scenario: Complete user lifecycle - create, read, update, delete

        // Step 1: Create a user
        User newUser = new User();
        newUser.setAlias("e2eUser");
        newUser.setEmail("e2e@test.com");

        UserDTO savedUser = userService.save(newUser.toDTO());

        // Verify user was created
        assertNotNull(savedUser.getId());
        assertEquals("e2eUser", savedUser.getAlias());
        assertEquals("e2e@test.com", savedUser.getEmail());

        // Step 2: Find the user by ID
        UserDTO foundById = userService.findById(savedUser.getId());
        assertNotNull(foundById);
        assertEquals("e2eUser", foundById.getAlias());

        // Step 3: Find the user by alias
        UserDTO foundByAlias = userService.findByAlias("e2eUser");
        assertNotNull(foundByAlias);
        assertEquals("e2e@test.com", foundByAlias.getEmail());

        // Step 4: Update the user
        UserDTO updatedUserData = new UserDTO();
        updatedUserData.setId(savedUser.getId());
        updatedUserData.setAlias("updatedE2EUser");
        updatedUserData.setEmail("updated@test.com");
        UserDTO updatedUser = userService.save(updatedUserData);

        // Verify update
        assertEquals("updatedE2EUser", updatedUser.getAlias());
        assertEquals("updated@test.com", updatedUser.getEmail());

        // Step 5: Verify the update is reflected when fetching again
        UserDTO refetchedUser = userService.findById(savedUser.getId());
        assertNotNull(refetchedUser);
        assertEquals("updatedE2EUser", refetchedUser.getAlias());
        assertEquals("updated@test.com", refetchedUser.getEmail());

        // Step 6: Find by the new alias
        UserDTO foundByNewAlias = userService.findByAlias("updatedE2EUser");
        assertNotNull(foundByNewAlias);
        assertEquals("updated@test.com", foundByNewAlias.getEmail());

        // Step 7: Delete the user
        userService.delete(savedUser.getId());

        // Step 8: Verify user is deleted by checking if exception is thrown
        assertThrows(ResourceNotFoundException.class, () -> {
            userService.findById(savedUser.getId());
        });
    }

    @Test
    void multipleUsersE2E() throws ResourceNotFoundException {
        // Scenario: Work with multiple users simultaneously

        // Step 1: Create multiple users
        User user1 = new User();
        user1.setAlias("multiUser1");
        user1.setEmail("multi1@test.com");
        user1.setIdentifier("password1");
        UserDTO savedUser1 = userService.save(user1.toDTO());

        User user2 = new User();
        user2.setAlias("multiUser2");
        user2.setEmail("multi2@test.com");
        user2.setIdentifier("password2");
        UserDTO savedUser2 = userService.save(user2.toDTO());

        User user3 = new User();
        user3.setAlias("multiUser3");
        user3.setEmail("multi3@test.com");
        user3.setIdentifier("password3");
        UserDTO savedUser3 = userService.save(user3.toDTO());

        // Step 2: Verify all users exist individually
        assertNotNull(userService.findById(savedUser1.getId()));
        assertNotNull(userService.findById(savedUser2.getId()));
        assertNotNull(userService.findById(savedUser3.getId()));

        assertNotNull(userService.findByAlias("multiUser1"));
        assertNotNull(userService.findByAlias("multiUser2"));
        assertNotNull(userService.findByAlias("multiUser3"));

        // Step 3: Get all users
        Set<UserDTO> allUsers = userService.findAll();
        assertEquals(3, allUsers.size());

        // Verify all users are in the set
        Set<String> aliases = new HashSet<>();
        for (UserDTO user : allUsers) {
            aliases.add(user.getAlias());
        }
        assertTrue(aliases.contains("multiUser1"));
        assertTrue(aliases.contains("multiUser2"));
        assertTrue(aliases.contains("multiUser3"));

        // Step 4: Update one user
        UserDTO updatedUser2 = new UserDTO();
        updatedUser2.setId(savedUser2.getId());
        updatedUser2.setAlias("updatedMultiUser2");
        updatedUser2.setEmail("updated-multi2@test.com");
        userService.save(updatedUser2);

        // Step 5: Verify the update doesn't affect other users
        Set<UserDTO> allUsersAfterUpdate = userService.findAll();
        assertEquals(3, allUsersAfterUpdate.size());

        UserDTO updatedUser = userService.findById(savedUser2.getId());
        assertEquals("updatedMultiUser2", updatedUser.getAlias());
        assertEquals("updated-multi2@test.com", updatedUser.getEmail());

        // Step 6: Delete one user
        userService.delete(savedUser1.getId());

        // Step 7: Verify only two users remain
        Set<UserDTO> remainingUsers = userService.findAll();
        assertEquals(2, remainingUsers.size());

        assertThrows(ResourceNotFoundException.class, () -> {
            userService.findById(savedUser1.getId());
        });
        assertNotNull(userService.findById(savedUser2.getId()));
        assertNotNull(userService.findById(savedUser3.getId()));
    }
}
