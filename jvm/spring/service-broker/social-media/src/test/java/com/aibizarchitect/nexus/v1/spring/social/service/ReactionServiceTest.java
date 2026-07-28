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

import com.aibizarchitect.nexus.v1.spring.social.model.Reaction;
import com.aibizarchitect.nexus.v1.spring.social.model.User;
import com.aibizarchitect.nexus.v1.spring.social.repository.ReactionRepository;

@ExtendWith(MockitoExtension.class)
@DisplayName("ReactionService")
class ReactionServiceTest {

    @Mock private ReactionRepository reactionRepository;

    @InjectMocks private ReactionService reactionService;

    private static final UUID REACTION_ID = UUID.randomUUID();
    private static final UUID USER_ID = UUID.randomUUID();

    private User user;
    private Reaction reaction;

    @BeforeEach
    void setUp() {
        user = new User("testuser", "test@example.com", "https://avatar.url");
        user.setId(USER_ID);

        reaction = new Reaction(user, Reaction.ReactionType.LIKE);
        reaction.setId(REACTION_ID);
    }

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath — valid inputs, successful operations")
    class GreenPath {

        @Test
        @DisplayName("save: saves reaction and returns it")
        void save_returnsReaction() {
            when(reactionRepository.save(any(Reaction.class))).thenReturn(reaction);

            Reaction result = reactionService.save(reaction);

            assertNotNull(result);
            assertEquals(REACTION_ID, result.getId());
        }

        @Test
        @DisplayName("findById: returns reaction when found")
        void findById_returnsReaction() {
            when(reactionRepository.findById(REACTION_ID)).thenReturn(Optional.of(reaction));

            Optional<Reaction> result = reactionService.findById(REACTION_ID.toString());

            assertTrue(result.isPresent());
            assertEquals(Reaction.ReactionType.LIKE, result.get().getReactionType());
        }

        @Test
        @DisplayName("findById: returns empty when not found")
        void findById_returnsEmpty() {
            when(reactionRepository.findById(any(UUID.class))).thenReturn(Optional.empty());

            Optional<Reaction> result = reactionService.findById(REACTION_ID.toString());

            assertTrue(result.isEmpty());
        }

        @Test
        @DisplayName("findAll: returns all reactions")
        void findAll_returnsAll() {
            Reaction r2 = new Reaction(user, Reaction.ReactionType.LOVE);
            r2.setId(UUID.randomUUID());
            when(reactionRepository.findAll()).thenReturn(List.of(reaction, r2));

            Set<Reaction> result = reactionService.findAll();

            assertEquals(2, result.size());
        }

        @Test
        @DisplayName("delete: deletes reaction by ID")
        void delete_deletesReaction() {
            doNothing().when(reactionRepository).deleteById(REACTION_ID);

            String result = reactionService.delete(REACTION_ID.toString());

            assertEquals("redirect:/Reaction/all", result);
        }
    }

    // ── ORANGE PATH ─────────────────────────────────────────────

    @Nested
    @DisplayName("OrangePath — edge cases and boundary conditions")
    class OrangePath {

        @Test
        @DisplayName("save: saves reaction successfully")
        void save_generatesIdAndTimestamp() {
            Reaction fresh = new Reaction(user, Reaction.ReactionType.ANGER);
            // Note: @PrePersist is a JPA callback, not invoked by Mockito
            when(reactionRepository.save(any(Reaction.class))).thenAnswer(inv -> {
                Reaction r = inv.getArgument(0);
                r.setId(UUID.randomUUID());
                return r;
            });

            Reaction result = reactionService.save(fresh);

            assertNotNull(result);
            assertNotNull(result.getId());
        }

        @Test
        @DisplayName("findAll: empty repository returns empty set")
        void findAll_emptyRepo() {
            when(reactionRepository.findAll()).thenReturn(Collections.emptyList());

            Set<Reaction> result = reactionService.findAll();

            assertTrue(result.isEmpty());
        }
    }

    // ── RED PATH ────────────────────────────────────────────────

    @Nested
    @DisplayName("RedPath — error conditions and exceptions")
    class RedPath {

        @Test
        @DisplayName("delete: invalid UUID throws IllegalArgumentException")
        void delete_invalidUuid() {
            assertThrows(IllegalArgumentException.class, () -> reactionService.delete("not-a-uuid"));
        }

        @Test
        @DisplayName("findById: invalid UUID throws IllegalArgumentException")
        void findById_invalidUuid() {
            assertThrows(IllegalArgumentException.class, () -> reactionService.findById("not-a-uuid"));
        }

        @Test
        @DisplayName("save: repository exception propagates")
        void save_repositoryException() {
            when(reactionRepository.save(any(Reaction.class))).thenThrow(new RuntimeException("DB error"));

            assertThrows(RuntimeException.class, () -> reactionService.save(reaction));
        }
    }

    // ── SILENT-FAILURE PATH ─────────────────────────────────────

    @Nested
    @DisplayName("SilentFailure — operations that fail without clear signal")
    class SilentFailure {

        @Test
        @DisplayName("update: deletes the reaction instead of updating — GAP: method name is misleading")
        void update_deletesNotUpdates() {
            doNothing().when(reactionRepository).deleteById(any(UUID.class));

            // update() calls deleteById() — this is a GAP, not a feature
            reactionService.update(REACTION_ID.toString());

            verify(reactionRepository).deleteById(REACTION_ID);
            // The method name "update" is misleading — it actually deletes
            // This test documents the GAP for future remediation
        }

        @Test
        @DisplayName("delete: returns hardcoded redirect string, not success/failure indicator")
        void delete_returnsHardcodedRedirect() {
            // delete() always returns "redirect:/Reaction/all" regardless of outcome
            // This is a silent-failure pattern — callers can't distinguish success from failure
            doNothing().when(reactionRepository).deleteById(REACTION_ID);

            String result = reactionService.delete(REACTION_ID.toString());

            // Always returns the same string — no error signaling
            assertEquals("redirect:/Reaction/all", result);
        }
    }
}
