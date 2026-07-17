package com.aibizarchitect.nexus.v1.spring.social.service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.spring.social.model.Comment;
import com.aibizarchitect.nexus.v1.spring.social.model.Post;
import com.aibizarchitect.nexus.v1.spring.social.model.Reaction;
import com.aibizarchitect.nexus.v1.spring.social.model.User;
import com.aibizarchitect.nexus.v1.spring.social.repository.CommentRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.PostRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.ReactionRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.UserRepository;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerOperation;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerParam;
import com.aibizarchitect.nexus.v1.spring.social.CommentDTO;
import com.aibizarchitect.nexus.v1.spring.social.ReactionDTO;

@Service
public class CommentService {
    private static final Logger log = LoggerFactory.getLogger(CommentService.class);
    private final CommentRepository commentRepository;
    private final UserRepository userRepository;
    private final PostRepository postRepository;
    private final ReactionRepository reactionRepository;

    public CommentService(CommentRepository commentRepository, PostRepository postRepository,
            UserRepository userRepository, ReactionRepository reactionRepository) {
        this.commentRepository = commentRepository;
        this.postRepository = postRepository;
        this.userRepository = userRepository;
        this.reactionRepository = reactionRepository;
        log.info("CommentService initialized");
    }

    @BrokerOperation("delete")
    public ServiceResponse<String> delete(@BrokerParam("commentId") String commentId) {
        log.info("Deleting comment id {}", commentId);
        try {
            commentRepository.deleteById(UUID.fromString(commentId));
            return ServiceResponse.ok("Comment deleted successfully", "delete-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error deleting comment: {}", e.getMessage());
            return (ServiceResponse<String>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to delete comment: " + e.getMessage())),
                    "delete-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("findById")
    public ServiceResponse<CommentDTO> findById(@BrokerParam("commentId") String commentId) {
        log.info("Find comment by id {}", commentId);
        try {
            Optional<Comment> comment = commentRepository.findById(UUID.fromString(commentId));
            if (comment.isPresent()) {
                return ServiceResponse.ok(comment.get().toDTO(), "findById-" + System.currentTimeMillis());
            }
            return (ServiceResponse<CommentDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Comment " + commentId + " not found")),
                    "findById-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error finding comment: {}", e.getMessage());
            return (ServiceResponse<CommentDTO>) ServiceResponse.error(
                    List.of(java.util.Map.of("message", "Failed to find comment: " + e.getMessage())),
                    "findById-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("findAll")
    public ServiceResponse<Iterable<CommentDTO>> findAll() {
        log.info("Find all comments");
        try {
            Iterable<CommentDTO> comments = commentRepository.findAll().stream()
                    .map(c -> c.toDTO())
                    .collect(Collectors.toSet());
            return ServiceResponse.ok(comments, "findAll-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error finding all comments: {}", e.getMessage());
            return (ServiceResponse<Iterable<CommentDTO>>) ServiceResponse.error(
                    List.of(java.util.Map.of("message", "Failed to find comments: " + e.getMessage())),
                    "findAll-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("findAllPaginated")
    public Page<CommentDTO> findAll(@BrokerParam("page") int page, @BrokerParam("size") int size) {
        log.info("Find all comments paginated page {} size {}", page, size);
        return commentRepository.findAll(PageRequest.of(page, size)).map(Comment::toDTO);
    }

    @BrokerOperation("findByUser")
    public Page<CommentDTO> findByUser(@BrokerParam("userId") String userId, @BrokerParam("page") int page,
            @BrokerParam("size") int size) {
        log.info("Find comments by user {} page {} size {}", userId, page, size);
        return commentRepository.findByPostedBy_Id(UUID.fromString(userId), PageRequest.of(page, size)).map(Comment::toDTO);
    }

    public CommentDTO save(Comment n) {
        log.info("Saving comment {}", n.getId());
        if (n.getPost() == null && n.getParent() == null) {
            throw new IllegalStateException(
                "Comment must reference either a post or a parent comment (chk_comment_attachment). "
                + "Use the addComment broker operation to create comments through the canonical flow.");
        }
        return commentRepository.save(n).toDTO();
    }

    public CommentDTO save(User postedBy, String text) {
        log.info("Saving comment by user {}", postedBy.getAlias());
        if (postedBy == null) {
            throw new IllegalStateException(
                "Comment must reference either a post or a parent comment (chk_comment_attachment). "
                + "Use the addComment broker operation to create comments through the canonical flow.");
        }
        return commentRepository.save(new Comment(postedBy, text)).toDTO();
    }

    @BrokerOperation("findCommentsForPost")
    public ServiceResponse<Iterable<Comment>> findCommentsForPost(@BrokerParam("postId") String postId) {
        log.info("Find comments for post id {}", postId);
        try {
            // Note: In MongoDB, the way to find comments for a post might be different
            // We may need to implement a custom method in the repository
            Iterable<Comment> comments = commentRepository.findByPost_Id(UUID.fromString(postId));
            return ServiceResponse.ok(comments, "findCommentsForPost-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error finding comments for post: {}", e.getMessage());
            return (ServiceResponse<Iterable<Comment>>) ServiceResponse.error(
                    java.util.List
                            .of(java.util.Map.of("message", "Failed to find comments for post: " + e.getMessage())),
                    "findCommentsForPost-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("addComment")
    public ServiceResponse<CommentDTO> addComment(@BrokerParam("data") CommentDTO data) {
        log.info("Adding comment by user {}", data.getPostedBy());
        try {
            Optional<User> user = userRepository.findByAlias(data.getPostedBy());

            if (user.isEmpty()) {
                return (ServiceResponse<CommentDTO>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "User not found: " + data.getPostedBy())),
                        "addComment-" + System.currentTimeMillis());
            }

        if (data.getPostId() != null && data.getParentId() == null) {
            CommentDTO result = addCommentToPost(user.get(), data);
            return ServiceResponse.ok(result, "addComment-" + System.currentTimeMillis());
        } else if (data.getPostId() == null && data.getParentId() != null) {
                CommentDTO result = addReplyToComment(user.get(), data);
                return ServiceResponse.ok(result, "addComment-" + System.currentTimeMillis());
            }

            return (ServiceResponse<CommentDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message",
                            "Invalid comment data - must specify either postId or parentId")),
                    "addComment-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error adding comment: {}", e.getMessage());
            return (ServiceResponse<CommentDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to add comment: " + e.getMessage())),
                    "addComment-" + System.currentTimeMillis());
        }
    }

    private CommentDTO addCommentToPost(User user, CommentDTO data) throws IllegalArgumentException {
        log.info("Adding comment to post id {}", data.getPostId());
        Optional<Post> postOpt = postRepository.findById(UUID.fromString(data.getPostId()));

        if (postOpt.isPresent()) {
            Post post = postOpt.get();

            Comment result = commentRepository.save(new Comment(user, data.getText(), post));

            post.getReplies().add(result);
            postRepository.save(post);

            return result.toDTO();
        }

        throw new IllegalArgumentException();
    }

    private CommentDTO addReplyToComment(User user, CommentDTO data) throws IllegalArgumentException {
        log.info("Adding reply to comment id {}", data.getParentId());
        Optional<Comment> commentOpt = commentRepository.findById(UUID.fromString(data.getParentId()));

        if (commentOpt.isPresent()) {
            Comment parent = commentOpt.get();

            Comment result = commentRepository.save(new Comment(user, data.getText(), parent));

            parent.getReplies().add(result);
            save(parent);

            return result.toDTO();
        }

        throw new IllegalArgumentException();
    }

    @BrokerOperation("addReaction")
    public ServiceResponse<ReactionDTO> addReaction(@BrokerParam("commentId") String commentId,
            @BrokerParam("reactionDTO") ReactionDTO reactionDTO) {
        log.info("Adding reaction to comment id {}", commentId);
        try {
            Reaction.ReactionType type = Reaction.ReactionType.valueOf(reactionDTO.getType().toUpperCase());

            Optional<User> userOpt = this.userRepository.findByAlias(reactionDTO.getAlias());
            Optional<Comment> commentOpt = commentRepository.findById(UUID.fromString(commentId));

            if (userOpt.isEmpty()) {
                return (ServiceResponse<ReactionDTO>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "User not found: " + reactionDTO.getAlias())),
                        "addReaction-" + System.currentTimeMillis());
            }

            if (commentOpt.isEmpty()) {
                return (ServiceResponse<ReactionDTO>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "Comment not found: " + commentId)),
                        "addReaction-" + System.currentTimeMillis());
            }

            Comment comment = commentOpt.get();
            User user = userOpt.get();

            Reaction reaction = new Reaction(user, type);
            reaction.setComment(comment);
            Reaction saved = reactionRepository.save(reaction);

            comment.getReactions().add(saved);
            commentRepository.save(comment);

            return ServiceResponse.ok(saved.toDTO(), "addReaction-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error adding reaction: {}", e.getMessage());
            return (ServiceResponse<ReactionDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to add reaction: " + e.getMessage())),
                    "addReaction-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("removeReaction")
    public ServiceResponse<String> removeReaction(@BrokerParam("commentId") String commentId,
            @BrokerParam("reactionDTO") ReactionDTO reactionDTO) {
        log.info("Removing reaction from comment id {}", commentId);
        try {
            Optional<Reaction> reactionOpt = this.reactionRepository.findById(UUID.fromString(reactionDTO.getId()));
            Optional<Comment> commentOpt = commentRepository.findById(UUID.fromString(commentId));

            if (commentOpt.isEmpty()) {
                return (ServiceResponse<String>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "Comment not found: " + commentId)),
                        "removeReaction-" + System.currentTimeMillis());
            }

            if (reactionOpt.isEmpty()) {
                return (ServiceResponse<String>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "Reaction not found: " + reactionDTO.getId())),
                        "removeReaction-" + System.currentTimeMillis());
            }

            Comment comment = commentOpt.get();
            Reaction reaction = reactionOpt.get();

            comment.getReactions().remove(reaction);
            reactionRepository.delete(reaction);
            commentRepository.save(comment);

            return ServiceResponse.ok("Reaction removed successfully", "removeReaction-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error removing reaction: {}", e.getMessage());
            return (ServiceResponse<String>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to remove reaction: " + e.getMessage())),
                    "removeReaction-" + System.currentTimeMillis());
        }
    }
}