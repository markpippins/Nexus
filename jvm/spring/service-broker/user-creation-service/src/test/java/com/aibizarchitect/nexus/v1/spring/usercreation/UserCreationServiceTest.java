package com.aibizarchitect.nexus.v1.spring.usercreation;

import com.aibizarchitect.nexus.v1.spring.user.model.UserRegistration;
import com.aibizarchitect.nexus.v1.spring.user.repository.UserRegistrationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("UserCreationService")
class UserCreationServiceTest {

    @Mock
    private UserRegistrationRepository repository;

    @InjectMocks
    private UserCreationService userCreationService;

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath — successful user creation")
    class GreenPath {

        @Test
        @DisplayName("createUser: saves new user when alias is unique")
        void createUser_savesNewUser() {
            when(repository.findByAlias("newuser")).thenReturn(Optional.empty());
            when(repository.save(any(UserRegistration.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            UserRegistration result = userCreationService.createUser(
                    "newuser", "new@example.com", "pass123", false);

            assertEquals("newuser", result.getAlias());
            assertEquals("new@example.com", result.getEmail());
            assertFalse(result.isAdmin());
            verify(repository).save(any(UserRegistration.class));
        }

        @Test
        @DisplayName("createUser: creates admin user when admin=true")
        void createUser_adminUser() {
            when(repository.findByAlias("admin")).thenReturn(Optional.empty());
            when(repository.save(any(UserRegistration.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            UserRegistration result = userCreationService.createUser(
                    "admin", "admin@e.com", "secret", true);

            assertTrue(result.isAdmin());
            assertEquals("admin", result.getAlias());
        }

        @Test
        @DisplayName("createUser: saves with identifier field")
        void createUser_withIdentifier() {
            when(repository.findByAlias("user")).thenReturn(Optional.empty());
            when(repository.save(any(UserRegistration.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            UserRegistration result = userCreationService.createUser(
                    "user", "u@e.com", "my-identifier", false);

            assertEquals("my-identifier", result.getIdentifier());
        }
    }

    // ── RED PATH ────────────────────────────────────────────────

    @Nested
    @DisplayName("RedPath — error conditions")
    class RedPath {

        @Test
        @DisplayName("createUser: throws when alias already exists")
        void createUser_duplicateAlias() {
            when(repository.findByAlias("existing"))
                    .thenReturn(Optional.of(new UserRegistration()));

            assertThrows(IllegalArgumentException.class,
                    () -> userCreationService.createUser(
                            "existing", "e@e.com", "pwd", false));
        }

        @Test
        @DisplayName("createUser: repository exception propagates")
        void createUser_repositoryException() {
            when(repository.findByAlias("user")).thenReturn(Optional.empty());
            when(repository.save(any())).thenThrow(new RuntimeException("DB error"));

            assertThrows(RuntimeException.class,
                    () -> userCreationService.createUser(
                            "user", "e@e.com", "pwd", false));
        }
    }

    // ── ORANGE PATH ─────────────────────────────────────────────

    @Nested
    @DisplayName("OrangePath — edge cases")
    class OrangePath {

        @Test
        @DisplayName("createUser: empty alias string passes through")
        void createUser_emptyAlias() {
            when(repository.findByAlias("")).thenReturn(Optional.empty());
            when(repository.save(any(UserRegistration.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            UserRegistration result = userCreationService.createUser(
                    "", "e@e.com", "id", false);

            assertEquals("", result.getAlias());
        }

        @Test
        @DisplayName("createUser: null identifier passes through")
        void createUser_nullIdentifier() {
            when(repository.findByAlias("user")).thenReturn(Optional.empty());
            when(repository.save(any(UserRegistration.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            // GAP: no null guard on identifier — passes through to entity
            UserRegistration result = userCreationService.createUser(
                    "user", "e@e.com", null, false);

            assertNull(result.getIdentifier());
        }
    }
}
