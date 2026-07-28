package com.aibizarchitect.nexus.v1.spring.social.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;

import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;
import com.aibizarchitect.nexus.v1.spring.social.ForumDTO;
import com.aibizarchitect.nexus.v1.spring.social.UserDTO;
import com.aibizarchitect.nexus.v1.spring.social.model.Forum;
import com.aibizarchitect.nexus.v1.spring.social.model.User;
import com.aibizarchitect.nexus.v1.spring.social.repository.ForumRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
@DisplayName("ForumService")
class ForumServiceTest {

    @Mock private ForumRepository forumRepository;
    @Mock private UserRepository userRepository;

    @InjectMocks private ForumService forumService;

    private static final UUID FORUM_ID = UUID.randomUUID();
    private static final UUID USER_ID = UUID.randomUUID();

    private Forum forum;
    private User user;

    @BeforeEach
    void setUp() {
        forum = new Forum("Test Forum");
        forum.setId(FORUM_ID);

        user = new User("testuser", "test@example.com", "https://avatar.url");
        user.setId(USER_ID);
    }

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath — valid inputs, successful operations")
    class GreenPath {

        @Test
        @DisplayName("save: creates forum by name")
        void save_createsByName() {
            when(forumRepository.save(any(Forum.class))).thenReturn(forum);

            ServiceResponse<ForumDTO> response = forumService.save("Test Forum");

            assertTrue(response.isOk());
            assertEquals("Test Forum", response.getData().getName());
        }

        @Test
        @DisplayName("saveForum: saves forum entity")
        void save_savesEntity() {
            when(forumRepository.save(any(Forum.class))).thenReturn(forum);

            ServiceResponse<ForumDTO> response = forumService.save(forum);

            assertTrue(response.isOk());
        }

        @Test
        @DisplayName("findById: returns forum when found")
        void findById_returnsForum() {
            when(forumRepository.findById(FORUM_ID)).thenReturn(Optional.of(forum));

            ServiceResponse<ForumDTO> response = forumService.findById(FORUM_ID.toString());

            assertTrue(response.isOk());
            assertEquals("Test Forum", response.getData().getName());
        }

        @Test
        @DisplayName("findByName: returns forum by name")
        void findByName_returnsForum() {
            when(forumRepository.findByName("Test Forum")).thenReturn(Optional.of(forum));

            ServiceResponse<ForumDTO> response = forumService.findByName("Test Forum");

            assertTrue(response.isOk());
        }

        @Test
        @DisplayName("findAll: returns all forums")
        void findAll_returnsAllForums() {
            Forum f2 = new Forum("Second");
            f2.setId(UUID.randomUUID());
            when(forumRepository.findAll()).thenReturn(List.of(forum, f2));

            ServiceResponse<Iterable<ForumDTO>> response = forumService.findAll();

            assertTrue(response.isOk());
            assertNotNull(response.getData());
        }

        @Test
        @DisplayName("delete: deletes forum by ID")
        void delete_deletesForum() {
            doNothing().when(forumRepository).deleteById(FORUM_ID);

            ServiceResponse<String> response = forumService.delete(FORUM_ID.toString());

            assertTrue(response.isOk());
        }

        @Test
        @DisplayName("addMember: adds user to forum")
        void addMember_addsUser() {
            when(forumRepository.findById(FORUM_ID)).thenReturn(Optional.of(forum));
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
            when(forumRepository.save(any(Forum.class))).thenReturn(forum);

            ServiceResponse<String> response = forumService.addMember(FORUM_ID.toString(), USER_ID.toString());

            assertTrue(response.isOk());
            assertTrue(forum.getMembers().contains(user));
        }

        @Test
        @DisplayName("removeMember: removes user from forum")
        void removeMember_removesUser() {
            forum.addMember(user);
            when(forumRepository.findById(FORUM_ID)).thenReturn(Optional.of(forum));
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
            when(forumRepository.save(any(Forum.class))).thenReturn(forum);

            ServiceResponse<String> response = forumService.removeMember(FORUM_ID.toString(), USER_ID.toString());

            assertTrue(response.isOk());
            assertTrue(forum.getMembers().isEmpty());
        }

        @Test
        @DisplayName("getMembers: returns paginated members")
        void getMembers_returnsPaginated() {
            forum.addMember(user);
            when(forumRepository.findById(FORUM_ID)).thenReturn(Optional.of(forum));

            Page<UserDTO> result = forumService.getMembers(FORUM_ID.toString(), 0, 10);

            assertEquals(1, result.getTotalElements());
        }

        @Test
        @DisplayName("getMembers: empty forum returns empty page")
        void getMembers_emptyForum() {
            when(forumRepository.findById(FORUM_ID)).thenReturn(Optional.empty());

            Page<UserDTO> result = forumService.getMembers(FORUM_ID.toString(), 0, 10);

            assertTrue(result.isEmpty());
        }
    }

    // ── ORANGE PATH ─────────────────────────────────────────────

    @Nested
    @DisplayName("OrangePath — edge cases and boundary conditions")
    class OrangePath {

        @Test
        @DisplayName("save: forum prePersist generates UUID")
        void save_forumGeneratesId() {
            Forum newForum = new Forum("Fresh");
            when(forumRepository.save(any(Forum.class))).thenAnswer(inv -> {
                Forum f = inv.getArgument(0);
                f.setId(UUID.randomUUID());
                return f;
            });

            ServiceResponse<ForumDTO> response = forumService.save("Fresh");

            assertTrue(response.isOk());
            assertNotNull(response.getData().getId());
        }

        @Test
        @DisplayName("addMember: null members initialized")
        void addMember_nullMembersInit() {
            Forum f = new Forum("Fresh");
            f.setId(FORUM_ID);
            // Don't call addMember — verify it initializes null set
            when(forumRepository.findById(FORUM_ID)).thenReturn(Optional.of(f));
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
            when(forumRepository.save(any(Forum.class))).thenReturn(f);

            ServiceResponse<String> response = forumService.addMember(FORUM_ID.toString(), USER_ID.toString());

            assertTrue(response.isOk());
            assertTrue(f.getMembers().contains(user));
        }
    }

    // ── RED PATH ────────────────────────────────────────────────

    @Nested
    @DisplayName("RedPath — error conditions and exceptions")
    class RedPath {

        @Test
        @DisplayName("findById: forum not found")
        void findById_notFound() {
            when(forumRepository.findById(any(UUID.class))).thenReturn(Optional.empty());

            ServiceResponse<ForumDTO> response = forumService.findById(FORUM_ID.toString());

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("findByName: forum not found")
        void findByName_notFound() {
            when(forumRepository.findByName("Missing")).thenReturn(Optional.empty());

            ServiceResponse<ForumDTO> response = forumService.findByName("Missing");

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("findById: invalid UUID returns error")
        void findById_invalidUuid() {
            ServiceResponse<ForumDTO> response = forumService.findById("not-a-uuid");

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("delete: repository exception")
        void delete_repositoryException() {
            doThrow(new RuntimeException("DB error")).when(forumRepository).deleteById(any(UUID.class));

            ServiceResponse<String> response = forumService.delete(FORUM_ID.toString());

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("addMember: forum not found")
        void addMember_forumNotFound() {
            when(forumRepository.findById(FORUM_ID)).thenReturn(Optional.empty());

            ServiceResponse<String> response = forumService.addMember(FORUM_ID.toString(), USER_ID.toString());

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("addMember: user not found")
        void addMember_userNotFound() {
            when(forumRepository.findById(FORUM_ID)).thenReturn(Optional.of(forum));
            when(userRepository.findById(USER_ID)).thenReturn(Optional.empty());

            ServiceResponse<String> response = forumService.addMember(FORUM_ID.toString(), USER_ID.toString());

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("removeMember: forum not found")
        void removeMember_forumNotFound() {
            when(forumRepository.findById(FORUM_ID)).thenReturn(Optional.empty());

            ServiceResponse<String> response = forumService.removeMember(FORUM_ID.toString(), USER_ID.toString());

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("removeMember: user not found")
        void removeMember_userNotFound() {
            when(forumRepository.findById(FORUM_ID)).thenReturn(Optional.of(forum));
            when(userRepository.findById(USER_ID)).thenReturn(Optional.empty());

            ServiceResponse<String> response = forumService.removeMember(FORUM_ID.toString(), USER_ID.toString());

            assertFalse(response.isOk());
        }
    }

    // ── SILENT-FAILURE PATH ─────────────────────────────────────

    @Nested
    @DisplayName("SilentFailure — operations that fail without clear signal")
    class SilentFailure {

        @Test
        @DisplayName("save: repository exception returns error, not runtime")
        void save_repositoryException() {
            when(forumRepository.save(any(Forum.class))).thenThrow(new RuntimeException("Constraint violation"));

            // Exception is caught and wrapped in ServiceResponse.error()
            ServiceResponse<ForumDTO> response = forumService.save("Duplicate");

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("removeMember: removing non-member silently succeeds")
        void removeMember_nonMember() {
            User nonMember = new User("stranger", "s@e.com", "url");
            nonMember.setId(UUID.randomUUID());

            when(forumRepository.findById(FORUM_ID)).thenReturn(Optional.of(forum));
            when(userRepository.findById(nonMember.getId())).thenReturn(Optional.of(nonMember));
            when(forumRepository.save(any(Forum.class))).thenReturn(forum);

            // Removing someone not in the set — Set.remove() does nothing
            ServiceResponse<String> response = forumService.removeMember(FORUM_ID.toString(), nonMember.getId().toString());

            // Silently succeeds — the user wasn't a member but no error is raised
            assertTrue(response.isOk());
        }
    }
}
