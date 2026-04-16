package com.angrysurfer.spring.nexus.user.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.angrysurfer.spring.nexus.user.UserRegistrationDTO;
import com.angrysurfer.spring.nexus.user.model.UserRegistration;
import com.angrysurfer.spring.nexus.user.repository.UserRegistrationRepository;

@ExtendWith(MockitoExtension.class)
class UserAccessServiceTest {

    @Mock
    private UserRegistrationRepository userRepository;

    @InjectMocks
    private UserAccessService userAccessService;

    private UserRegistration testUser;

    @BeforeEach
    void setUp() {
        testUser = new UserRegistration();
        testUser.setAlias("testuser");
        testUser.setEmail("test@example.com");
        testUser.setId(1L);
    }

    @Test
    void validateUser_WithValidCredentials_ShouldReturnUserDto() {
        // Given
        when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(testUser));

        // When
        UserRegistrationDTO result = userAccessService.validateUser("testuser", "ignored");

        // Then
        assertNotNull(result);
        assertEquals("testuser", result.getAlias());
        assertEquals("test@example.com", result.getEmail());
        assertEquals("1", result.getId()); // ID is converted to String in DTO
        verify(userRepository, times(1)).findByAlias("testuser");
    }

    @Test
    void validateUser_WithNonExistentUser_ShouldReturnNull() {
        // Given
        when(userRepository.findByAlias("nonexistent")).thenReturn(Optional.empty());

        // When
        UserRegistrationDTO result = userAccessService.validateUser("nonexistent", "anyPassword");

        // Then
        assertNull(result);
        verify(userRepository, times(1)).findByAlias("nonexistent");
    }

    @Test
    void validateUser_WithNullAlias_ShouldReturnNull() {
        // Given
        when(userRepository.findByAlias(null)).thenReturn(Optional.empty());

        // When
        UserRegistrationDTO result = userAccessService.validateUser(null, "password");

        // Then
        assertNull(result);
        verify(userRepository, times(1)).findByAlias(null);
    }
}