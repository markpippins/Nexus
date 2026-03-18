package com.angrysurfer.spring.nexus.user.repository;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.angrysurfer.spring.nexus.user.model.UserRegistration;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserRegistrationRepositoryTest {

    @Mock
    private UserRegistrationRepository userRegistrationRepository;

    @Test
    void findByAlias_WithExistingUser_ShouldReturnUser() {
        // Given
        UserRegistration expectedUser = new UserRegistration();
        expectedUser.setAlias("testuser");
        when(userRegistrationRepository.findByAlias("testuser")).thenReturn(Optional.of(expectedUser));

        // When
        Optional<UserRegistration> result = userRegistrationRepository.findByAlias("testuser");

        // Then
        assertTrue(result.isPresent());
        assertEquals("testuser", result.get().getAlias());
        verify(userRegistrationRepository).findByAlias("testuser");
    }

    @Test
    void findByAlias_WithNonExistingUser_ShouldReturnEmpty() {
        // Given
        when(userRegistrationRepository.findByAlias("nonexistent")).thenReturn(Optional.empty());

        // When
        Optional<UserRegistration> result = userRegistrationRepository.findByAlias("nonexistent");

        // Then
        assertFalse(result.isPresent());
        verify(userRegistrationRepository).findByAlias("nonexistent");
    }

    @Test
    void findByEmail_WithExistingUser_ShouldReturnUser() {
        // Given
        UserRegistration expectedUser = new UserRegistration();
        expectedUser.setEmail("test@example.com");
        when(userRegistrationRepository.findByEmail("test@example.com")).thenReturn(Optional.of(expectedUser));

        // When
        Optional<UserRegistration> result = userRegistrationRepository.findByEmail("test@example.com");

        // Then
        assertTrue(result.isPresent());
        assertEquals("test@example.com", result.get().getEmail());
        verify(userRegistrationRepository).findByEmail("test@example.com");
    }

    @Test
    void findByEmail_WithNonExistingUser_ShouldReturnEmpty() {
        // Given
        when(userRegistrationRepository.findByEmail("nonexistent@example.com")).thenReturn(Optional.empty());

        // When
        Optional<UserRegistration> result = userRegistrationRepository.findByEmail("nonexistent@example.com");

        // Then
        assertFalse(result.isPresent());
        verify(userRegistrationRepository).findByEmail("nonexistent@example.com");
    }
}