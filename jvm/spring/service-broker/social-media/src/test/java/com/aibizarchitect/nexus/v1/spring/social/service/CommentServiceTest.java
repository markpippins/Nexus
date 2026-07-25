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
import com.aibizarchitect.nexus.v1.spring.social.ReactionDTO;
import com.aibizarchitect.nexus.v1.spring.social.model.Comment;
import com.aibizarchitect.nexus.v1.spring.social.model.Post;
import com.aibizarchitect.nexus.v1.spring.social.model.Reaction;
import com.aibizarchitect.nexus.v1.spring.social.model.User;
import com.aibizarchitect.nexus.v1.spring.social.repository.CommentRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.PostRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.ReactionRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
@DisplayName("CommentService")
class CommentServiceTest {

    @Mock private CommentRepository commentRepository;
    @Mock private PostRepository postRepository;
    @Mock private UserRepository userRepository;
    @Mock private ReactionRepository reactionRepository;

    @InjectMocks private CommentService commentService;

    private static final UUID COMMENT_ID = UUID.randomUUID();
    private static final UUID POST_ID = UUID.randomUUID();
    private static final UUID USER_ID = UUID.randomUUID();

    private User user;
    private Post post;
    private Comment comment;
    private CommentDTO commentDTO;

    @BeforeEach
    void setUp() {
        user = new User("testuser", "test@example.com", "https://avatar.url");
        user.setId(USER_ID);

        post = new Post(user, null, "Post content");
        post.setId(POST_ID);

        comment = new Comment(user, "A comment", post);
        comment.setId(COMMENT_ID);

        commentDTO = new CommentDTO();
        commentDTO.setId(COMMENT_ID.toString());
        commentDTO.setText("A comment");
        commentDTO.setPostedBy("testuser");
        commentDTO.setPostId(POST_ID.toString());
    }

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath — valid inputs, successful operations")
    class GreenPath {

        @Test
        @DisplayName("addComment: adds comment to post")
        void addComment_toPost() {
            when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(user));
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(post));
            when(commentRepository.save(any(Comment.class))).thenReturn(comment);
            when(postRepository.save(any(Post.class))).thenReturn(post);

            ServiceResponse<CommentDTO> response = commentService.addComment(commentDTO);

            assertTrue(response.isOk());
            assertEquals("A comment", response.getData().getText());
        }

        @Test
        @DisplayName("addComment: adds reply to parent comment")
        void addComment_replyToComment() {
            CommentDTO replyDTO = new CommentDTO();
            replyDTO.setText("A reply");
            replyDTO.setPostedBy("testuser");
            replyDTO.setParentId(COMMENT_ID.toString());

            Comment reply = new Comment(user, "A reply", comment);
            reply.setId(UUID.randomUUID());

            when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(user));
            when(commentRepository.findById(COMMENT_ID)).thenReturn(Optional.of(comment));
            when(commentRepository.save(any(Comment.class))).thenReturn(reply);

            ServiceResponse<CommentDTO> response = commentService.addComment(replyDTO);

            assertTrue(response.isOk());
        }

        @Test
        @DisplayName("findById: returns comment when found")
        void findById_returnsComment() {
            when(commentRepository.findById(COMMENT_ID)).thenReturn(Optional.of(comment));

            ServiceResponse<CommentDTO> response = commentService.findById(COMMENT_ID.toString());

            assertTrue(response.isOk());
            assertEquals("A comment", response.getData().getText());
        }

        @Test
        @DisplayName("findAll: returns all comments")
        void findAll_returnsAllComments() {
            Comment c2 = new Comment(user, "Another", post);
            c2.setId(UUID.randomUUID());
            when(commentRepository.findAll()).thenReturn(List.of(comment, c2));

            ServiceResponse<Iterable<CommentDTO>> response = commentService.findAll();

            assertTrue(response.isOk());
            assertNotNull(response.getData());
        }

        @Test
        @DisplayName("findAllPaginated: returns paginated comments")
        void findAllPaginated_returnsPage() {
            Page<Comment> page = new PageImpl<>(List.of(comment));
            when(commentRepository.findAll(any(PageRequest.class))).thenReturn(page);

            Page<CommentDTO> result = commentService.findAll(0, 10);

            assertEquals(1, result.getTotalElements());
        }

        @Test
        @DisplayName("delete: deletes comment by ID")
        void delete_deletesComment() {
            doNothing().when(commentRepository).deleteById(COMMENT_ID);

            ServiceResponse<String> response = commentService.delete(COMMENT_ID.toString());

            assertTrue(response.isOk());
        }

        @Test
        @DisplayName("findByUser: returns comments by user")
        void findByUser_returnsComments() {
            Page<Comment> page = new PageImpl<>(List.of(comment));
            when(commentRepository.findByPostedBy_Id(eq(USER_ID), any(PageRequest.class))).thenReturn(page);

            Page<CommentDTO> result = commentService.findByUser(USER_ID.toString(), 0, 10);

            assertEquals(1, result.getTotalElements());
        }

        @Test
        @DisplayName("findCommentsForPost: returns comments for post")
        void findCommentsForPost_returnsComments() {
            when(commentRepository.findByPost_Id(POST_ID)).thenReturn(Set.of(comment));

            ServiceResponse<Iterable<Comment>> response = commentService.findCommentsForPost(POST_ID.toString());

            assertTrue(response.isOk());
        }

        @Test
        @DisplayName("addReaction: adds reaction to comment")
        void addReaction_addsToComment() {
            ReactionDTO rDTO = new ReactionDTO();
            rDTO.setType("LIKE");
            rDTO.setAlias("testuser");

            Reaction reaction = new Reaction(user, Reaction.ReactionType.LIKE);
            reaction.setId(UUID.randomUUID());

            when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(user));
            when(commentRepository.findById(COMMENT_ID)).thenReturn(Optional.of(comment));
            when(reactionRepository.save(any(Reaction.class))).thenReturn(reaction);
            when(commentRepository.save(any(Comment.class))).thenReturn(comment);

            ServiceResponse<ReactionDTO> response = commentService.addReaction(COMMENT_ID.toString(), rDTO);

            assertTrue(response.isOk());
        }

        @Test
        @DisplayName("removeReaction: removes reaction from comment")
        void removeReaction_removesFromComment() {
            UUID rId = UUID.randomUUID();
            Reaction reaction = new Reaction(user, Reaction.ReactionType.LIKE);
            reaction.setId(rId);
            comment.getReactions().add(reaction);

            ReactionDTO rDTO = new ReactionDTO();
            rDTO.setId(rId.toString());

            when(commentRepository.findById(COMMENT_ID)).thenReturn(Optional.of(comment));
            when(reactionRepository.findById(rId)).thenReturn(Optional.of(reaction));
            doNothing().when(reactionRepository).delete(any(Reaction.class));
            when(commentRepository.save(any(Comment.class))).thenReturn(comment);

            ServiceResponse<String> response = commentService.removeReaction(COMMENT_ID.toString(), rDTO);

            assertTrue(response.isOk());
        }
    }

    // ── ORANGE PATH ─────────────────────────────────────────────

    @Nested
    @DisplayName("OrangePath — edge cases and boundary conditions")
    class OrangePath {

        @Test
        @DisplayName("addComment: neither postId nor parentId returns error")
        void addComment_neitherPostNorParent() {
            CommentDTO badDTO = new CommentDTO();
            badDTO.setPostedBy("testuser");
            badDTO.setText("orphan");

            when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(user));

            ServiceResponse<CommentDTO> response = commentService.addComment(badDTO);

            assertFalse(response.isOk());
            assertTrue(response.getErrors().get(0).get("message").toString().contains("Invalid comment data"));
        }

        @Test
        @DisplayName("save: comment without post or parent throws")
        void save_commentWithoutAttachment() {
            Comment orphan = new Comment(user, "orphan");

            assertThrows(IllegalStateException.class, () -> commentService.save(orphan));
        }

        @Test
        @DisplayName("save: null postedBy — GAP: NPE from log before null check")
        void save_nullPostedBy() {
            // GAP: log.info uses postedBy.getAlias() BEFORE the null check at line 162
            // This causes NPE instead of the intended IllegalStateException
            assertThrows(NullPointerException.class, () -> commentService.save((User) null, "text"));
        }
    }

    // ── RED PATH ────────────────────────────────────────────────

    @Nested
    @DisplayName("RedPath — error conditions and exceptions")
    class RedPath {

        @Test
        @DisplayName("addComment: user not found")
        void addComment_userNotFound() {
            when(userRepository.findByAlias("testuser")).thenReturn(Optional.empty());

            ServiceResponse<CommentDTO> response = commentService.addComment(commentDTO);

            assertFalse(response.isOk());
            assertTrue(response.getErrors().get(0).get("message").toString().contains("User not found"));
        }

        @Test
        @DisplayName("findById: comment not found")
        void findById_notFound() {
            when(commentRepository.findById(any(UUID.class))).thenReturn(Optional.empty());

            ServiceResponse<CommentDTO> response = commentService.findById(COMMENT_ID.toString());

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("findById: invalid UUID returns error")
        void findById_invalidUuid() {
            ServiceResponse<CommentDTO> response = commentService.findById("not-a-uuid");

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("delete: repository exception returns error")
        void delete_repositoryException() {
            doThrow(new RuntimeException("DB error")).when(commentRepository).deleteById(any(UUID.class));

            ServiceResponse<String> response = commentService.delete(COMMENT_ID.toString());

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("addReaction: comment not found")
        void addReaction_commentNotFound() {
            ReactionDTO rDTO = new ReactionDTO();
            rDTO.setType("LIKE");
            rDTO.setAlias("testuser");
            when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(user));
            when(commentRepository.findById(COMMENT_ID)).thenReturn(Optional.empty());

            ServiceResponse<ReactionDTO> response = commentService.addReaction(COMMENT_ID.toString(), rDTO);

            assertFalse(response.isOk());
            assertTrue(response.getErrors().get(0).get("message").toString().contains("Comment not found"));
        }

        @Test
        @DisplayName("addReaction: user not found")
        void addReaction_userNotFound() {
            ReactionDTO rDTO = new ReactionDTO();
            rDTO.setType("LIKE");
            rDTO.setAlias("nonexistent");
            when(userRepository.findByAlias("nonexistent")).thenReturn(Optional.empty());

            ServiceResponse<ReactionDTO> response = commentService.addReaction(COMMENT_ID.toString(), rDTO);

            assertFalse(response.isOk());
        }
    }

    // ── SILENT-FAILURE PATH ─────────────────────────────────────

    @Nested
    @DisplayName("SilentFailure — operations that fail without clear signal")
    class SilentFailure {

        @Test
        @DisplayName("addComment: post not found throws IllegalArgumentException from private method")
        void addComment_postNotFound_throwsException() {
            commentDTO.setPostId(POST_ID.toString());
            commentDTO.setParentId(null);

            when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(user));
            when(postRepository.findById(POST_ID)).thenReturn(Optional.empty());

            // The private addCommentToPost throws IllegalArgumentException
            // which is caught by the catch block
            ServiceResponse<CommentDTO> response = commentService.addComment(commentDTO);

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("addComment: parent comment not found throws IllegalArgumentException")
        void addComment_parentNotFound_throwsException() {
            CommentDTO replyDTO = new CommentDTO();
            replyDTO.setText("reply");
            replyDTO.setPostedBy("testuser");
            replyDTO.setParentId(UUID.randomUUID().toString());

            when(userRepository.findByAlias("testuser")).thenReturn(Optional.of(user));
            when(commentRepository.findById(any(UUID.class))).thenReturn(Optional.empty());

            ServiceResponse<CommentDTO> response = commentService.addComment(replyDTO);

            assertFalse(response.isOk());
        }
    }
}
