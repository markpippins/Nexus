package com.angrysurfer.spring.nexus.login.e2e;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

import java.time.Duration; // Import Duration
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import com.angrysurfer.spring.nexus.user.UserRegistrationDTO;
import com.angrysurfer.spring.nexus.login.LoginService;
import com.angrysurfer.spring.nexus.login.client.UserAccessClient;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LoginServiceE2ETest {

    @Mock
    private RedisTemplate<String, Object> redisTemplate;

    @Mock
    private ValueOperations<String, Object> valueOperations;

    private LoginService loginService;

    private Map<String, Object> redisStore; // In-memory store

    @Mock
    private UserAccessClient userAccessClient;

    @BeforeEach
    void setUp() {
        redisStore = new HashMap<>();
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);

        // Mock ValueOperations.set to store in our in-memory map
        doAnswer(invocation -> {
            String key = invocation.getArgument(0);
            Object value = invocation.getArgument(1);
            Duration timeout = invocation.getArgument(2);
            redisStore.put(key, value);
            return null;
        }).when(valueOperations).set(anyString(), any(), any(Duration.class));

        // Mock ValueOperations.get to retrieve from our in-memory map
        when(valueOperations.get(anyString())).thenAnswer(invocation -> redisStore.get(invocation.getArgument(0)));

        // Mock RedisTemplate.delete to remove from our in-memory map
        when(redisTemplate.delete(anyString()))
                .thenAnswer(invocation -> redisStore.remove(invocation.getArgument(0)) != null);

        // Mock UserAccessClient
        when(userAccessClient.validateUser(any())).thenAnswer(invocation -> {
            org.springframework.util.MultiValueMap<String, String> params = invocation.getArgument(0);
            String alias = params.getFirst("alias");
            String password = params.getFirst("identifier");

            if (alias != null && !alias.isEmpty() && password != null && !password.isEmpty()) {
                UserRegistrationDTO user = new UserRegistrationDTO();
                user.setId("1"); // Default ID
                if ("user2".equals(alias))
                    user.setId("2");
                if ("user3".equals(alias))
                    user.setId("3");
                user.setAlias(alias);
                user.setAdmin(false);
                return user;
            } else {
                throw new feign.FeignException.Unauthorized("Unauthorized", null, null, null);
            }
        });

        loginService = new LoginService(redisTemplate, userAccessClient);
    }

    @Test
    void completeAuthenticationFlowE2E() {
        // Scenario: Complete authentication flow - login, check status, get user,
        // logout

        // Step 1: Login the user with valid credentials (non-empty strings)
        var loginResult = loginService.login("e2eUser", "password123");

        // Verify login was successful
        assertTrue(loginResult.isOk());
        assertNotNull(loginResult.getData());
        assertTrue(loginResult.getData().isOk());
        assertNotNull(loginResult.getData().getToken());
        assertEquals("1", loginResult.getData().getUserId());
        assertFalse(loginResult.getData().isAdmin());

        String token = loginResult.getData().getToken();
        assertNotNull(token);

        // Step 2: Check if user is logged in
        var statusResult = loginService.isLoggedIn(token);

        // Verify user is logged in
        assertTrue(statusResult.isOk());
        assertTrue(statusResult.getData());

        // Step 3: Get user registration for the token
        var userResult = loginService.getUserRegistrationForToken(token);

        // Verify user details can be retrieved
        assertTrue(userResult.isOk());
        assertNotNull(userResult.getData());
        assertEquals("e2eUser", userResult.getData().getAlias());
        assertEquals("1", userResult.getData().getId());

        // Step 4: Logout the user
        var logoutResult = loginService.logout(token);

        // Verify logout was successful
        assertTrue(logoutResult.isOk());
        assertTrue(logoutResult.getData());

        // Step 5: Verify user is no longer logged in after logout
        var statusAfterLogout = loginService.isLoggedIn(token);
        assertTrue(statusAfterLogout.isOk()); // Operation succeeded
        assertFalse(statusAfterLogout.getData()); // But user is not logged in
    }

    @Test
    void multipleUserAuthenticationFlowE2E() {
        // Scenario: Multiple users authenticating simultaneously

        // Step 1: Login all users
        var loginResult1 = loginService.login("user1", "password1");
        var loginResult2 = loginService.login("user2", "password2");
        var loginResult3 = loginService.login("user3", "password3");

        // Verify all logins were successful
        assertTrue(loginResult1.isOk() && loginResult1.getData() != null && loginResult1.getData().getToken() != null);
        assertTrue(loginResult2.isOk() && loginResult2.getData() != null && loginResult2.getData().getToken() != null);
        assertTrue(loginResult3.isOk() && loginResult3.getData() != null && loginResult3.getData().getToken() != null);

        String token1 = loginResult1.getData().getToken();
        String token2 = loginResult2.getData().getToken();
        String token3 = loginResult3.getData().getToken();

        assertNotNull(token1);
        assertNotNull(token2);
        assertNotNull(token3);

        // Step 2: Verify each user is logged in with their own token
        assertTrue(loginService.isLoggedIn(token1).getData());
        assertTrue(loginService.isLoggedIn(token2).getData());
        assertTrue(loginService.isLoggedIn(token3).getData());

        // Step 3: Verify each user can retrieve their own data
        assertEquals("user1", loginService.getUserRegistrationForToken(token1).getData().getAlias());
        assertEquals("user2", loginService.getUserRegistrationForToken(token2).getData().getAlias());
        assertEquals("user3", loginService.getUserRegistrationForToken(token3).getData().getAlias());

        // Step 4: Verify users cannot access each other's data
        assertNotEquals("user2", loginService.getUserRegistrationForToken(token1).getData().getAlias());
        assertNotEquals("user3", loginService.getUserRegistrationForToken(token1).getData().getAlias());

        // Step 5: Logout one user and verify others remain logged in
        assertTrue(loginService.logout(token1).getData());
        assertFalse(loginService.isLoggedIn(token1).getData()); // User1 logged out
        assertTrue(loginService.isLoggedIn(token2).getData()); // User2 still logged in
        assertTrue(loginService.isLoggedIn(token3).getData()); // User3 still logged in
    }

    @Test
    void authenticationFailureFlowE2E() {
        // Scenario: Test authentication failure scenarios

        // Step 1: Attempt login with invalid credentials (empty strings)
        var failedLoginResult = loginService.login("", ""); // Empty credentials

        // Verify login failed
        assertFalse(failedLoginResult.isOk());
        assertNotNull(failedLoginResult.getData());
        assertFalse(failedLoginResult.getData().isOk());
        assertNull(failedLoginResult.getData().getToken());
        assertTrue(failedLoginResult.getData().getErrors().containsKey("credentials"));

        // Step 2: Try to use the invalid token for other operations
        String invalidToken = "invalid-token";
        var statusResult = loginService.isLoggedIn(invalidToken);
        assertFalse(statusResult.isOk()); // Should fail due to invalid token format
        assertFalse(statusResult.getData());

        var userResult = loginService.getUserRegistrationForToken(invalidToken);
        assertFalse(userResult.isOk()); // Should fail due to invalid token format
        assertNull(userResult.getData());

        var logoutResult = loginService.logout(invalidToken);
        assertFalse(logoutResult.isOk()); // Should fail due to invalid token format
        assertFalse(logoutResult.getData());
    }

    @Test
    void tokenValidationAndSecurityE2E() {
        // Scenario: Test token validation and security measures

        // Step 1: Successfully login a user
        var loginResult = loginService.login("secureUser", "password");
        assertTrue(loginResult.isOk());
        String validToken = loginResult.getData().getToken();
        assertNotNull(validToken);

        // Step 2: Verify the token is valid
        assertTrue(loginService.isLoggedIn(validToken).getData());

        // Step 3: Test with malformed tokens
        String[] malformedTokens = {
                null,
                "",
                "not-a-uuid",
                "12345",
                "this-is-not-a-valid-uuid-format-at-all"
        };

        for (String malformedToken : malformedTokens) {
            var result = loginService.isLoggedIn(malformedToken);
            assertFalse(result.isOk(), "Token validation should fail for: " + malformedToken);

            var userResult = loginService.getUserRegistrationForToken(malformedToken);
            assertFalse(userResult.isOk(), "User retrieval should fail for: " + malformedToken);

            var logoutResult = loginService.logout(malformedToken);
            assertFalse(logoutResult.isOk(), "Logout should fail for: " + malformedToken);
        }

        // Step 4: Verify valid token still works after invalid attempts
        assertTrue(loginService.isLoggedIn(validToken).getData());
    }
}
