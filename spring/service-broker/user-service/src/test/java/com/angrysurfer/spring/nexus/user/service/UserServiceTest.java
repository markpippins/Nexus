package com.angrysurfer.spring.nexus.user.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.angrysurfer.spring.nexus.user.ResourceNotFoundException;
import com.angrysurfer.spring.nexus.user.User;
import com.angrysurfer.spring.nexus.user.UserDTO;
import com.angrysurfer.spring.nexus.user.UserRepository;
import com.angrysurfer.spring.nexus.user.UserService;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserService userService;

    private User testUser;
    private UserDTO expectedUserDTO;

    @BeforeEach
    void setUp() {
        testUser = new User();
        testUser.setId("1"); // MongoDB uses String IDs
        testUser.setAlias("testuser");
        testUser.setEmail("test@example.com");

        expectedUserDTO = testUser.toDTO(); // Convert User to DTO for comparison
    }

    @Test
    void findById_WithExistingUser_ShouldReturnUser() throws ResourceNotFoundException {
        // Given
        when(userRepository.findById("1")).thenReturn(Optional.of(testUser));

        // When
        UserDTO result = userService.findById("1");

        // Then
        assertNotNull(result);
        assertEquals("testuser", result.getAlias());
        verify(userRepository, times(1)).findById("1");
    }

    @Test
    void findById_WithNonExistingUser_ShouldThrowException() {
        // Given
        when(userRepository.findById("999")).thenReturn(Optional.empty());

        // When & Then
        assertThrows(ResourceNotFoundException.class, () -> {
            userService.findById("999");
        });
        verify(userRepository, times(1)).findById("999");
    }

    @Test
    void findAll_ShouldReturnAllUsers() {
        // Given
        List<User> users = Arrays.asList(testUser);
        when(userRepository.findAll()).thenReturn(users);

        // When
        Set<UserDTO> result = userService.findAll();

        // Then
        assertEquals(1, result.size());
        assertEquals("testuser", result.iterator().next().getAlias());
        verify(userRepository, times(1)).findAll();
    }

    @Test
    void save_ShouldSaveAndReturnUser() {
        // Given
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        // When
        UserDTO result = userService.save(testUser.toDTO());

        // Then
        assertEquals("testuser", result.getAlias());
        verify(userRepository, times(1)).save(any(User.class));
    }

    @Test
    void deleteById_ShouldDeleteUser() {
        // When
        userService.delete("1");

        // Then
        verify(userRepository, times(1)).deleteById("1");
    }

    @Test
    void findByAlias_WithExistingUser_ShouldReturnUser() throws ResourceNotFoundException {
        // Given
        when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(testUser));

        // When
        UserDTO result = userService.findByAlias("testuser");

        // Then
        assertNotNull(result);
        assertEquals("testuser", result.getAlias());
        verify(userRepository, times(1)).findByAlias("testuser");
    }

    @Test
    void findByAlias_WithNonExistingUser_ShouldThrowException() {
        // Given
        when(userRepository.findByAlias("nonexistent")).thenReturn(Optional.empty());

        // When & Then
        assertThrows(ResourceNotFoundException.class, () -> {
            userService.findByAlias("nonexistent");
        });
        verify(userRepository, times(1)).findByAlias("nonexistent");
    }
}