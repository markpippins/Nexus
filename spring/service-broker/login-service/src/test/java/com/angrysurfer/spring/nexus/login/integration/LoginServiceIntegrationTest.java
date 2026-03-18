package com.angrysurfer.spring.nexus.login.integration;

import com.angrysurfer.spring.nexus.broker.api.ServiceRequest;
import com.angrysurfer.spring.nexus.broker.api.ServiceResponse;
import com.angrysurfer.spring.nexus.login.LoginResponse;
import com.angrysurfer.spring.nexus.login.LoginService;
import com.angrysurfer.spring.nexus.login.client.UserAccessClient;
import com.angrysurfer.nexus.user.UserRegistrationDTO;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import org.mockito.quality.Strictness;
import org.mockito.junit.jupiter.MockitoSettings;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LoginServiceIntegrationTest {

    @Mock
    private RedisTemplate<String, Object> redisTemplate;

    @Mock
    private ValueOperations<String, Object> valueOperations;

    @Mock
    private UserAccessClient userAccessClient;

    private LoginService loginService;

    @BeforeEach
    void setUp() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        loginService = new LoginService(redisTemplate, userAccessClient);
    }

    @Test
    void login_WithValidUser_ShouldReturnToken() {
        // Given
        UserRegistrationDTO mockUser = new UserRegistrationDTO();
        mockUser.setId("1");
        mockUser.setAdmin(false);
        when(userAccessClient.validateUser(any())).thenReturn(mockUser);

        // When
        var result = loginService.login("testuser", "password123");

        // Then
        assertTrue(result.isOk());
        assertNotNull(result.getData());
        assertTrue(result.getData().isOk());
        assertNotNull(result.getData().getToken());
        assertEquals("1", result.getData().getUserId());
        assertFalse(result.getData().isAdmin());
    }

    @Test
    void login_WithInvalidCredentials_ShouldReturnFailure() {
        // Given
        feign.Request request = feign.Request.create(feign.Request.HttpMethod.GET, "url",
                java.util.Collections.emptyMap(), null, null, null);
        when(userAccessClient.validateUser(any()))
                .thenThrow(new feign.FeignException.Unauthorized("Unauthorized", request, null, null));

        // When
        var result = loginService.login("", ""); // Empty credentials

        // Then
        assertFalse(result.isOk());
        assertNotNull(result.getData());
        assertFalse(result.getData().isOk());
        assertNull(result.getData().getToken());
        assertTrue(result.getData().getErrors().containsKey("credentials"));
    }

    @Test
    void logout_WithValidToken_ShouldReturnTrue() {
        // Given
        String token = java.util.UUID.randomUUID().toString();
        UserRegistrationDTO mockUser = new UserRegistrationDTO();
        when(valueOperations.get("user:" + token)).thenReturn(mockUser);
        when(redisTemplate.delete("user:" + token)).thenReturn(true);

        // When
        var result = loginService.logout(token);

        // Then
        assertTrue(result.isOk());
        assertTrue(result.getData());
    }

    @Test
    void logout_WithInvalidToken_ShouldReturnFalse() {
        // Given
        String invalidToken = "invalid-token";

        // When
        var result = loginService.logout(invalidToken);

        // Then
        assertFalse(result.isOk());
        assertFalse(result.getData());
        assertTrue(result.getErrors().stream().anyMatch(error -> "token".equals(error.get("field"))));
    }

    @Test
    void isLoggedIn_WithValidToken_ShouldReturnTrue() {
        // Given
        String token = java.util.UUID.randomUUID().toString();
        when(valueOperations.get("user:" + token)).thenReturn(new UserRegistrationDTO());

        // When
        var result = loginService.isLoggedIn(token);

        // Then
        assertTrue(result.isOk());
        assertTrue(result.getData());
    }

    @Test
    void isLoggedIn_WithInvalidToken_ShouldReturnFalse() {
        // Given
        String invalidToken = "invalid-token";

        // When
        var result = loginService.isLoggedIn(invalidToken);

        // Then
        assertFalse(result.isOk());
        assertFalse(result.getData());
        assertTrue(result.getErrors().stream().anyMatch(error -> "token".equals(error.get("field"))));
    }

    @Test
    void getUserRegistrationForToken_WithValidToken_ShouldReturnUser() {
        // Given
        String token = java.util.UUID.randomUUID().toString();
        UserRegistrationDTO expectedUser = new UserRegistrationDTO();
        expectedUser.setAlias("testuser");
        when(valueOperations.get("user:" + token)).thenReturn(expectedUser);

        // When
        var result = loginService.getUserRegistrationForToken(token);

        // Then
        assertTrue(result.isOk());
        assertNotNull(result.getData());
        assertEquals("testuser", result.getData().getAlias());
    }

    @Test
    void getUserRegistrationForToken_WithInvalidToken_ShouldReturnFailure() {
        // Given
        String invalidToken = "invalid-token";

        // When
        var result = loginService.getUserRegistrationForToken(invalidToken);

        // Then
        assertFalse(result.isOk());
        assertNull(result.getData());
        assertTrue(result.getErrors().stream().anyMatch(error -> "token".equals(error.get("field"))));
    }
}