package com.aibizarchitect.nexus.v1.spring.user.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
class UserServiceIntegrationTest {

    @Container
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
    void saveAndFindById_ShouldWorkCorrectly() throws ResourceNotFoundException {
        // Given
        User user = new User();
        user.setAlias("integrationTestUser");
        user.setEmail("integration@test.com");
        user.setIdentifier("password123");

        // When
        UserDTO savedUser = userService.save(user.toDTO());

        // Then
        assertNotNull(savedUser.getId());
        assertEquals("integrationTestUser", savedUser.getAlias());
        assertEquals("integration@test.com", savedUser.getEmail());

        // When
        UserDTO foundUser = userService.findById(savedUser.getId());

        // Then
        assertNotNull(foundUser);
        assertEquals("integrationTestUser", foundUser.getAlias());
        assertEquals("integration@test.com", foundUser.getEmail());
    }

    @Test
    void findAll_ShouldReturnAllUsers() {
        // Given
        User user1 = new User();
        user1.setAlias("user1");
        user1.setEmail("user1@test.com");
        User user2 = new User();
        user2.setAlias("user2");
        user2.setEmail("user2@test.com");
        userRepository.save(user1);
        userRepository.save(user2);

        // When
        Set<UserDTO> users = userService.findAll();

        // Then
        assertEquals(2, users.size());
        assertTrue(users.stream().anyMatch(u -> "user1".equals(u.getAlias())));
        assertTrue(users.stream().anyMatch(u -> "user2".equals(u.getAlias())));
    }

    @Test
    void findByAlias_ShouldReturnCorrectUser() throws ResourceNotFoundException {
        // Given
        User user = new User();
        user.setAlias("findByAliasTest");
        user.setEmail("findByAlias@test.com");
        userRepository.save(user);

        // When
        UserDTO foundUser = userService.findByAlias("findByAliasTest");

        // Then
        assertNotNull(foundUser);
        assertEquals("findByAliasTest", foundUser.getAlias());
        assertEquals("findByAlias@test.com", foundUser.getEmail());
    }

    @Test
    void delete_ShouldRemoveUser() throws ResourceNotFoundException {
        // Given
        User user = new User();
        user.setAlias("toBeDeleted");
        user.setEmail("tobedeleted@test.com");
        UserDTO savedUser = userService.save(user.toDTO());

        // When
        userService.delete(savedUser.getId());

        // Then
        assertThrows(ResourceNotFoundException.class, () -> {
            userService.findById(savedUser.getId());
        });
    }

    @Test
    void update_ShouldUpdateUserCorrectly() throws ResourceNotFoundException {
        // Given
        User user = new User();
        user.setAlias("originalAlias");
        user.setEmail("original@test.com");
        UserDTO savedUser = userService.save(user.toDTO());

        // When
        UserDTO updatedUserDTO = new UserDTO();
        updatedUserDTO.setId(savedUser.getId());
        updatedUserDTO.setAlias("updatedAlias");
        updatedUserDTO.setEmail("updated@test.com");
        UserDTO updatedUser = userService.save(updatedUserDTO);

        // Then
        assertEquals("updatedAlias", updatedUser.getAlias());
        assertEquals("updated@test.com", updatedUser.getEmail());
    }
}
