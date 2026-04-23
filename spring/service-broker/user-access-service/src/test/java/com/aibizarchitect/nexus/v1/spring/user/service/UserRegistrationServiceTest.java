package com.aibizarchitect.nexus.v1.spring.user.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.aibizarchitect.nexus.v1.user.UserRegistrationDTO;
import com.aibizarchitect.nexus.v1.spring.user.model.UserRegistration;
import com.aibizarchitect.nexus.v1.spring.user.repository.UserRegistrationRepository;
import com.aibizarchitect.nexus.v1.spring.user.service.UserAccessService;

class UserRegistrationServiceTest {

    private UserRegistrationRepository userRepository;

    private UserAccessService userAccessService;
    private UserRegistration validUser;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRegistrationRepository.class);
        userAccessService = new UserAccessService(userRepository);

        validUser = new UserRegistration();
        validUser.setId(123L);
        validUser.setAlias("testUser");
        validUser.setEmail("test@example.com");
    }

    @Test
    void testLoginSuccess() {
        when(userRepository.findByAlias("testUser")).thenReturn(Optional.of(validUser));

        UserRegistrationDTO result = userAccessService.validateUser("testUser", "ignored");

        assertNotNull(result);
        assertEquals("123", result.getId());
        assertEquals("testUser", result.getAlias());
    }

    @Test
    void testLoginFailureUserNotFound() {
        when(userRepository.findByAlias("nonexistent")).thenReturn(Optional.empty());

        UserRegistrationDTO result = userAccessService.validateUser("nonexistent", "password123");

        assertNull(result);
    }
}
