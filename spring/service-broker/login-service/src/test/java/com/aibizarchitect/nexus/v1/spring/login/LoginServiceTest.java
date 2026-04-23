package com.aibizarchitect.nexus.v1.spring.login;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;
import com.aibizarchitect.nexus.v1.spring.login.client.UserAccessClient;
import com.aibizarchitect.nexus.v1.user.UserRegistrationDTO;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LoginServiceTest {

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
    void login_WithValidCredentials_ShouldReturnSuccess() {
        // Given
        UserRegistrationDTO mockUser = new UserRegistrationDTO();
        mockUser.setId("1");
        mockUser.setAlias("testuser");
        mockUser.setAdmin(false);

        when(userAccessClient.validateUser(any())).thenReturn(mockUser);

        // When
        ServiceResponse<LoginResponse> result = loginService.login("testuser", "password123");

        // Then
        assertTrue(result.isOk());
        assertNotNull(result.getData());
        assertTrue(result.getData().isOk());
        assertNotNull(result.getData().getToken());
        assertEquals("1", result.getData().getUserId());
        assertFalse(result.getData().isAdmin());

        // Verify that user was stored in Redis
        verify(valueOperations).set(any(String.class), any(UserRegistrationDTO.class), any());
    }

    @Test
    void login_WithInvalidCredentials_ShouldReturnFailure() {
        // Given
        when(userAccessClient.validateUser(any())).thenReturn(null);

        // When
        ServiceResponse<LoginResponse> result = loginService.login("invalid", "invalid");

        // Then
        assertFalse(result.isOk());
        assertNotNull(result.getData());
        assertFalse(result.getData().isOk());
        assertNull(result.getData().getToken());
    }

    @Test
    void login_WithException_ShouldReturnFailure() {
        // Given
        when(userAccessClient.validateUser(any())).thenThrow(new RuntimeException("Service down"));

        // When
        ServiceResponse<LoginResponse> result = loginService.login("testuser", "password123");

        // Then
        // As per implementation, exceptions from UserAccessClient are caught, logged,
        // and treated as auth failure
        assertFalse(result.isOk());
        assertNotNull(result.getData());
        assertEquals("invalid credentials", result.getData().getMessage());
        assertTrue(result.getData().getErrors().containsKey("credentials"));
    }

    @Test
    void logout_WithValidToken_ShouldReturnTrue() {
        // Given
        String token = UUID.randomUUID().toString();
        String key = "user:" + token;
        UserRegistrationDTO mockUser = new UserRegistrationDTO();
        when(valueOperations.get(key)).thenReturn(mockUser);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(redisTemplate.delete(key)).thenReturn(true);

        // When
        ServiceResponse<Boolean> result = loginService.logout(token);

        // Then
        assertTrue(result.isOk());
        assertTrue(result.getData());
        verify(redisTemplate).delete(key);
    }

    @Test
    void logout_WithInvalidTokenFormat_ShouldReturnFalse() {
        // Given
        String invalidToken = "invalid-uuid";

        // When
        ServiceResponse<Boolean> result = loginService.logout(invalidToken);

        // Then
        assertFalse(result.isOk());
        assertFalse(result.getData());
        assertTrue(result.getErrors().stream().anyMatch(error -> "token".equals(error.get("field"))));
        assertTrue(result.getErrors().stream().anyMatch(error -> "Invalid token format".equals(error.get("message"))));
    }

    @Test
    void isLoggedIn_WithValidToken_ShouldReturnTrue() {
        // Given
        String token = UUID.randomUUID().toString();
        String key = "user:" + token;
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get(key)).thenReturn(new UserRegistrationDTO());

        // When
        ServiceResponse<Boolean> result = loginService.isLoggedIn(token);

        // Then
        assertTrue(result.isOk());
        assertTrue(result.getData());
    }

    @Test
    void isLoggedIn_WithInvalidTokenFormat_ShouldReturnFalse() {
        // Given
        String invalidToken = "invalid-uuid";

        // When
        ServiceResponse<Boolean> result = loginService.isLoggedIn(invalidToken);

        // Then
        assertFalse(result.isOk());
        assertFalse(result.getData());
        assertTrue(result.getErrors().stream().anyMatch(error -> "token".equals(error.get("field"))));
        assertTrue(result.getErrors().stream().anyMatch(error -> "Invalid token format".equals(error.get("message"))));
    }

    @Test
    void isLoggedIn_WithNonExistentToken_ShouldReturnFalse() {
        // Given
        String token = UUID.randomUUID().toString();
        String key = "user:" + token;
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get(key)).thenReturn(null);

        // When
        ServiceResponse<Boolean> result = loginService.isLoggedIn(token);

        // Then
        assertTrue(result.isOk());
        assertFalse(result.getData());
    }

    @Test
    void getUserRegistrationForToken_WithValidToken_ShouldReturnUser() {
        // Given
        String token = UUID.randomUUID().toString();
        String key = "user:" + token;
        UserRegistrationDTO expectedUser = new UserRegistrationDTO();
        expectedUser.setAlias("testuser");
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get(key)).thenReturn(expectedUser);

        // When
        ServiceResponse<UserRegistrationDTO> result = loginService.getUserRegistrationForToken(token);

        // Then
        assertTrue(result.isOk());
        assertEquals(expectedUser, result.getData());
    }

    @Test
    void getUserRegistrationForToken_WithInvalidTokenFormat_ShouldReturnFailure() {
        // Given
        String invalidToken = "invalid-uuid";

        // When
        ServiceResponse<UserRegistrationDTO> result = loginService.getUserRegistrationForToken(invalidToken);

        // Then
        assertFalse(result.isOk());
        assertNull(result.getData());
        assertTrue(result.getErrors().stream().anyMatch(error -> "token".equals(error.get("field"))));
        assertTrue(result.getErrors().stream().anyMatch(error -> "Invalid token format".equals(error.get("message"))));
    }
}
