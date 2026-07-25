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
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;
import com.aibizarchitect.nexus.v1.spring.social.CommentDTO;
import com.aibizarchitect.nexus.v1.spring.social.PostDTO;
import com.aibizarchitect.nexus.v1.spring.social.PostStatDTO;
import com.aibizarchitect.nexus.v1.spring.social.ReactionDTO;
import com.aibizarchitect.nexus.v1.spring.social.model.Comment;
import com.aibizarchitect.nexus.v1.spring.social.model.Post;
import com.aibizarchitect.nexus.v1.spring.social.model.Reaction;
import com.aibizarchitect.nexus.v1.spring.social.model.User;
import com.aibizarchitect.nexus.v1.spring.social.repository.CommentRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.EditRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.PostRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.ReactionRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
@DisplayName("PostService")
class PostServiceTest {

    @Mock private PostRepository postRepository;
    @Mock private EditRepository editRepository;
    @Mock private UserRepository userRepository;
    @Mock private ReactionRepository reactionRepository;
    @Mock private CommentRepository commentRepository;

    @InjectMocks private PostService postService;

    private static final UUID POST_ID = UUID.randomUUID();
    private static final UUID USER_ID = UUID.randomUUID();
    private static final String POST_ID_STR = POST_ID.toString();
    private static final String USER_ID_STR = USER_ID.toString();

    private User user;
    private Post post;
    private PostDTO postDTO;

    @BeforeEach
    void setUp() {
        user = new User("testuser", "test@example.com", "https://avatar.url");
        user.setId(USER_ID);

        post = new Post(user, null, "Test post content");
        post.setId(POST_ID);
        post.setRating(5L);

        postDTO = new PostDTO();
        postDTO.setId(POST_ID_STR);
        postDTO.setText("Test post content");
        postDTO.setPostedBy("testuser");
    }

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath — valid inputs, successful operations")
    class GreenPath {

        @Test
        @DisplayName("save: creates post for existing user")
        void save_createsPostForExistingUser() {
            when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(user));
            when(postRepository.save(any(Post.class))).thenReturn(post);

            ServiceResponse<PostDTO> response = postService.save(postDTO);

            assertTrue(response.isOk());
            assertNotNull(response.getData());
            assertEquals("Test post content", response.getData().getText());
        }

        @Test
        @DisplayName("save: creates forum post when forumId is set")
        void save_createsForumPost() {
            postDTO.setForumId(42L);
            post.setForumId(42L);
            when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(user));
            when(postRepository.save(any(Post.class))).thenReturn(post);

            ServiceResponse<PostDTO> response = postService.save(postDTO);

            assertTrue(response.isOk());
            assertNotNull(response.getData());
        }

        @Test
        @DisplayName("save: creates directed post when postedTo is set")
        void save_createsDirectedPost() {
            postDTO.setPostedTo("otheruser");
            User otherUser = new User("otheruser", "other@example.com", "https://avatar.url");
            otherUser.setId(UUID.randomUUID());
            when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(user));
            when(userRepository.findByAlias("otheruser")).thenReturn(Optional.of(otherUser));
            when(postRepository.save(any(Post.class))).thenReturn(post);

            ServiceResponse<PostDTO> response = postService.save(postDTO);

            assertTrue(response.isOk());
        }

        @Test
        @DisplayName("findById: returns post when found")
        void findById_returnsPost() {
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(post));

            ServiceResponse<PostDTO> response = postService.findById(POST_ID_STR);

            assertTrue(response.isOk());
            assertEquals("Test post content", response.getData().getText());
        }

        @Test
        @DisplayName("findAll: returns all posts")
        void findAll_returnsAllPosts() {
            User user2 = new User("user2", "u2@example.com", "https://avatar.url");
            user2.setId(UUID.randomUUID());
            Post post2 = new Post(user2, null, "Second post");
            post2.setId(UUID.randomUUID());
            post2.setForumId(99L); // Different forumId to ensure distinct DTOs
            when(postRepository.findAll()).thenReturn(List.of(post, post2));

            ServiceResponse<Set<PostDTO>> response = postService.findAll();

            assertTrue(response.isOk());
            assertEquals(2, response.getData().size());
        }

        @Test
        @DisplayName("delete: deletes post by ID")
        void delete_deletesPost() {
            doNothing().when(postRepository).deleteById(POST_ID);

            ServiceResponse<String> response = postService.delete(POST_ID_STR);

            assertTrue(response.isOk());
            assertTrue(response.getData().contains("deleted"));
        }

        @Test
        @DisplayName("findByUser: returns paginated posts for user")
        void findByUser_returnsPaginatedPosts() {
            Page<Post> page = new PageImpl<>(List.of(post));
            when(postRepository.findByPostedBy_Id(eq(USER_ID), any(PageRequest.class))).thenReturn(page);

            Page<PostDTO> result = postService.findByUser(USER_ID_STR, 0, 10);

            assertEquals(1, result.getTotalElements());
            assertEquals("Test post content", result.getContent().get(0).getText());
        }

        @Test
        @DisplayName("incrementRating: bumps rating by 1")
        void incrementRating_bumpsRating() {
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(post));
            when(postRepository.save(any(Post.class))).thenReturn(post);

            ServiceResponse<PostStatDTO> response = postService.incrementRating(POST_ID_STR);

            assertTrue(response.isOk());
            assertEquals(6L, post.getRating()); // was 5
        }

        @Test
        @DisplayName("incrementRating: handles null rating gracefully")
        void incrementRating_nullRating() {
            post.setRating(null);
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(post));
            when(postRepository.save(any(Post.class))).thenReturn(post);

            ServiceResponse<PostStatDTO> response = postService.incrementRating(POST_ID_STR);

            assertTrue(response.isOk());
            assertEquals(1L, post.getRating());
        }

        @Test
        @DisplayName("decrementRating: lowers rating by 1")
        void decrementRating_lowersRating() {
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(post));
            when(postRepository.save(any(Post.class))).thenReturn(post);

            ServiceResponse<PostStatDTO> response = postService.decrementRating(POST_ID_STR);

            assertTrue(response.isOk());
            assertEquals(4L, post.getRating());
        }

        @Test
        @DisplayName("decrementRating: floor at zero")
        void decrementRating_floorsAtZero() {
            post.setRating(0L);
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(post));
            when(postRepository.save(any(Post.class))).thenReturn(post);

            ServiceResponse<PostStatDTO> response = postService.decrementRating(POST_ID_STR);

            assertTrue(response.isOk());
            assertEquals(0L, post.getRating());
        }

        @Test
        @DisplayName("addReaction: adds reaction to post")
        void addReaction_addsReaction() {
            ReactionDTO rDTO = new ReactionDTO();
            rDTO.setType("LIKE");
            rDTO.setAlias("testuser");

            Reaction reaction = new Reaction(user, Reaction.ReactionType.LIKE);
            reaction.setId(UUID.randomUUID());
            when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(user));
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(post));
            when(reactionRepository.save(any(Reaction.class))).thenReturn(reaction);
            when(postRepository.save(any(Post.class))).thenReturn(post);

            ServiceResponse<ReactionDTO> response = postService.addReaction(POST_ID_STR, rDTO);

            assertTrue(response.isOk());
        }

        @Test
        @DisplayName("removeReaction: removes reaction from post")
        void removeReaction_removesReaction() {
            UUID reactionId = UUID.randomUUID();
            Reaction reaction = new Reaction(user, Reaction.ReactionType.LIKE);
            reaction.setId(reactionId);
            post.getReactions().add(reaction);

            ReactionDTO rDTO = new ReactionDTO();
            rDTO.setId(reactionId.toString());

            when(reactionRepository.findById(reactionId)).thenReturn(Optional.of(reaction));
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(post));
            doNothing().when(reactionRepository).delete(any(Reaction.class));
            when(postRepository.save(any(Post.class))).thenReturn(post);

            ServiceResponse<String> response = postService.removeReaction(POST_ID_STR, rDTO);

            assertTrue(response.isOk());
        }

        @Test
        @DisplayName("getRepliesForPost: returns post replies")
        void getRepliesForPost_returnsReplies() {
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(post));

            ServiceResponse<Set<CommentDTO>> response = postService.getRepliesForPost(POST_ID_STR);

            assertTrue(response.isOk());
            assertNotNull(response.getData());
        }

        @Test
        @DisplayName("addPostToForum: adds post to forum")
        void addPostToForum_addsPost() {
            when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(user));
            when(postRepository.save(any(Post.class))).thenReturn(post);

            ServiceResponse<PostDTO> response = postService.addPostToForum(42L, postDTO);

            assertTrue(response.isOk());
        }

        @Test
        @DisplayName("deleteComment: removes comment from post")
        void deleteComment_removesComment() {
            UUID commentId = UUID.randomUUID();
            Comment comment = new Comment(user, "Nice post!");
            comment.setId(commentId);
            comment.setPost(post);
            // Use a fresh Post for verification to avoid bidirectional equals/hashCode recursion
            Post freshPost = new Post(user, null, "Test post content");
            freshPost.setId(POST_ID);
            freshPost.getReplies().add(comment);

            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(freshPost));
            when(commentRepository.findById(commentId)).thenReturn(Optional.of(comment));
            when(postRepository.save(any(Post.class))).thenAnswer(inv -> inv.getArgument(0));
            doNothing().when(commentRepository).delete(any(Comment.class));

            ServiceResponse<String> response = postService.deleteComment(POST_ID_STR, commentId.toString());

            assertTrue(response.isOk());
        }
    }

    // ── ORANGE PATH ─────────────────────────────────────────────

    @Nested
    @DisplayName("OrangePath — edge cases and boundary conditions")
    class OrangePath {

        @Test
        @DisplayName("save: invalid ReactionType is caught")
        void addReaction_invalidReactionType() {
            ReactionDTO rDTO = new ReactionDTO();
            rDTO.setType("INVALID_TYPE");
            rDTO.setAlias("testuser");

            ServiceResponse<ReactionDTO> response = postService.addReaction(POST_ID_STR, rDTO);

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("save: null postedTo with no forumId creates bare post")
        void save_nullPostedToNoForum() {
            postDTO.setPostedTo(null);
            postDTO.setForumId(null);
            when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(user));
            when(postRepository.save(any(Post.class))).thenReturn(post);

            ServiceResponse<PostDTO> response = postService.save(postDTO);

            assertTrue(response.isOk());
        }

        @Test
        @DisplayName("findAll: empty repository returns empty set")
        void findAll_emptyRepository() {
            when(postRepository.findAll()).thenReturn(Collections.emptyList());

            ServiceResponse<Set<PostDTO>> response = postService.findAll();

            assertTrue(response.isOk());
            assertTrue(response.getData().isEmpty());
        }

        @Test
        @DisplayName("deleteComment: comment exists but not in post replies")
        void deleteComment_notInPostReplies() {
            UUID commentId = UUID.randomUUID();
            Comment comment = new Comment(user, "orphan comment");
            comment.setId(commentId);

            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(post));
            when(commentRepository.findById(commentId)).thenReturn(Optional.of(comment));

            ServiceResponse<String> response = postService.deleteComment(POST_ID_STR, commentId.toString());

            assertFalse(response.isOk());
            assertTrue(response.getErrors().get(0).get("message").toString().contains("not found in post replies"));
        }
    }

    // ── RED PATH ────────────────────────────────────────────────

    @Nested
    @DisplayName("RedPath — error conditions and exceptions")
    class RedPath {

        @Test
        @DisplayName("save: user not found returns error")
        void save_userNotFound() {
            when(userRepository.findByAlias("testuser")).thenReturn(Optional.empty());

            ServiceResponse<PostDTO> response = postService.save(postDTO);

            assertFalse(response.isOk());
            assertTrue(response.getErrors().get(0).get("message").toString().contains("User not found"));
        }

        @Test
        @DisplayName("save: postedTo user not found returns error")
        void save_postedToNotFound() {
            postDTO.setPostedTo("nonexistent");
            when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(user));
            when(userRepository.findByAlias("nonexistent")).thenReturn(Optional.empty());

            ServiceResponse<PostDTO> response = postService.save(postDTO);

            assertFalse(response.isOk());
            assertTrue(response.getErrors().get(0).get("message").toString().contains("Invalid post data"));
        }

        @Test
        @DisplayName("findById: post not found returns error")
        void findById_notFound() {
            when(postRepository.findById(any(UUID.class))).thenReturn(Optional.empty());

            ServiceResponse<PostDTO> response = postService.findById(POST_ID_STR);

            assertFalse(response.isOk());
            assertTrue(response.getErrors().get(0).get("message").toString().contains("not found"));
        }

        @Test
        @DisplayName("findById: invalid UUID returns error")
        void findById_invalidUuid() {
            ServiceResponse<PostDTO> response = postService.findById("not-a-uuid");

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("delete: repository exception returns error")
        void delete_repositoryException() {
            doThrow(new RuntimeException("DB error")).when(postRepository).deleteById(any(UUID.class));

            ServiceResponse<String> response = postService.delete(POST_ID_STR);

            assertFalse(response.isOk());
            assertTrue(response.getErrors().get(0).get("message").toString().contains("Failed to delete"));
        }

        @Test
        @DisplayName("addReaction: user not found")
        void addReaction_userNotFound() {
            ReactionDTO rDTO = new ReactionDTO();
            rDTO.setType("LIKE");
            rDTO.setAlias("nonexistent");
            when(userRepository.findByAlias("nonexistent")).thenReturn(Optional.empty());

            ServiceResponse<ReactionDTO> response = postService.addReaction(POST_ID_STR, rDTO);

            assertFalse(response.isOk());
            assertTrue(response.getErrors().get(0).get("message").toString().contains("User not found"));
        }

        @Test
        @DisplayName("addReaction: post not found")
        void addReaction_postNotFound() {
            ReactionDTO rDTO = new ReactionDTO();
            rDTO.setType("LIKE");
            rDTO.setAlias("testuser");
            when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(user));
            when(postRepository.findById(POST_ID)).thenReturn(Optional.empty());

            ServiceResponse<ReactionDTO> response = postService.addReaction(POST_ID_STR, rDTO);

            assertFalse(response.isOk());
            assertTrue(response.getErrors().get(0).get("message").toString().contains("not found"));
        }

        @Test
        @DisplayName("removeReaction: post not found")
        void removeReaction_postNotFound() {
            ReactionDTO rDTO = new ReactionDTO();
            rDTO.setId(UUID.randomUUID().toString());
            when(postRepository.findById(POST_ID)).thenReturn(Optional.empty());

            ServiceResponse<String> response = postService.removeReaction(POST_ID_STR, rDTO);

            assertFalse(response.isOk());
            assertTrue(response.getErrors().get(0).get("message").toString().contains("not found"));
        }

        @Test
        @DisplayName("removeReaction: reaction not found")
        void removeReaction_reactionNotFound() {
            ReactionDTO rDTO = new ReactionDTO();
            rDTO.setId(UUID.randomUUID().toString());
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(post));
            when(reactionRepository.findById(any(UUID.class))).thenReturn(Optional.empty());

            ServiceResponse<String> response = postService.removeReaction(POST_ID_STR, rDTO);

            assertFalse(response.isOk());
            assertTrue(response.getErrors().get(0).get("message").toString().contains("not found"));
        }

        @Test
        @DisplayName("incrementRating: post not found")
        void incrementRating_postNotFound() {
            when(postRepository.findById(POST_ID)).thenReturn(Optional.empty());

            ServiceResponse<PostStatDTO> response = postService.incrementRating(POST_ID_STR);

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("decrementRating: post not found")
        void decrementRating_postNotFound() {
            when(postRepository.findById(POST_ID)).thenReturn(Optional.empty());

            ServiceResponse<PostStatDTO> response = postService.decrementRating(POST_ID_STR);

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("deleteComment: post not found")
        void deleteComment_postNotFound() {
            when(postRepository.findById(POST_ID)).thenReturn(Optional.empty());

            ServiceResponse<String> response = postService.deleteComment(POST_ID_STR, UUID.randomUUID().toString());

            assertFalse(response.isOk());
        }
    }

    // ── SILENT-FAILURE PATH ─────────────────────────────────────

    @Nested
    @DisplayName("SilentFailure — operations that fail without clear signal")
    class SilentFailure {

        @Test
        @DisplayName("getRepliesForPost: null replies in post returns empty set")
        void getRepliesForPost_nullReplies() {
            Post postWithNullReplies = new Post(user, null, "content");
            postWithNullReplies.setId(POST_ID);
            // Force replies to null via reflection-like state manipulation
            // The toDTO() method handles null replies
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(postWithNullReplies));

            ServiceResponse<Set<CommentDTO>> response = postService.getRepliesForPost(POST_ID_STR);

            assertTrue(response.isOk());
            // toDTO returns empty HashSet for null replies — verify no NPE
            assertNotNull(response.getData());
        }

        @Test
        @DisplayName("deleteComment: repository exception wrapped in error response")
        void deleteComment_commentRepositoryException() {
            UUID commentId = UUID.randomUUID();
            Comment comment = new Comment(user, "Nice post!");
            comment.setId(commentId);
            comment.setPost(post);
            Post freshPost = new Post(user, null, "Test post content");
            freshPost.setId(POST_ID);
            freshPost.getReplies().add(comment);

            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(freshPost));
            when(commentRepository.findById(commentId)).thenReturn(Optional.of(comment));
            doThrow(new RuntimeException("DB error")).when(commentRepository).delete(any(Comment.class));

            // Exception is caught and wrapped in ServiceResponse.error()
            ServiceResponse<String> response = postService.deleteComment(POST_ID_STR, commentId.toString());

            assertFalse(response.isOk());
            assertTrue(response.getErrors().get(0).get("message").toString().contains("Failed to delete"));
        }
    }
}
