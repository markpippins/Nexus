package com.aibizarchitect.nexus.v1.spring.social.service;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.spring.social.model.Edit;
import com.aibizarchitect.nexus.v1.spring.social.model.Post;
import com.aibizarchitect.nexus.v1.spring.social.model.Reaction;
import com.aibizarchitect.nexus.v1.spring.social.model.User;
import com.aibizarchitect.nexus.v1.spring.social.repository.CommentRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.EditRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.PostRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.ReactionRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.UserRepository;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerOperation;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerParam;
import com.aibizarchitect.nexus.v1.spring.social.CommentDTO;
import com.aibizarchitect.nexus.v1.spring.social.PostDTO;
import com.aibizarchitect.nexus.v1.spring.social.PostStatDTO;
import com.aibizarchitect.nexus.v1.spring.social.ReactionDTO;
import com.aibizarchitect.nexus.v1.spring.social.model.Comment;
import org.springframework.data.domain.PageRequest;

@Service
public class PostService {

    private static final Logger log = LoggerFactory.getLogger(PostService.class);
    private static final String NOT_FOUND = " not found.";

    private static final String POST = "Post ";

    private final PostRepository postRepository;

    private final EditRepository editRepository;

    private final UserRepository userRepository;

    private final ReactionRepository reactionRepository;
    private final CommentRepository commentRepository;

    public PostService(PostRepository postRepository, EditRepository editRepository, UserRepository userRepository,
            ReactionRepository reactionRepository, CommentRepository commentRepository) {
        this.postRepository = postRepository;
        this.editRepository = editRepository;
        this.userRepository = userRepository;
        this.reactionRepository = reactionRepository;
        this.commentRepository = commentRepository;

        log.info("PostService initialized");
    }

    @BrokerOperation("delete")
    public ServiceResponse<String> delete(@BrokerParam("postId") String postId) {
        log.info("Delete post id {}", postId);
        try {
            postRepository.deleteById(UUID.fromString(postId));
            return ServiceResponse.ok("Post deleted successfully", "delete-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error deleting post: {}", e.getMessage());
            return (ServiceResponse<String>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to delete post: " + e.getMessage())),
                    "delete-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("findById")
    public ServiceResponse<PostDTO> findById(@BrokerParam("postId") String postId) {
        log.info("Find post by id {}", postId);
        try {
            Optional<Post> result = postRepository.findById(UUID.fromString(postId));
            if (result.isPresent()) {
                return ServiceResponse.ok(result.get().toDTO(), "findById-" + System.currentTimeMillis());
            }
            return (ServiceResponse<PostDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Post " + postId + " not found")),
                    "findById-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error finding post by id: {}", e.getMessage());
            return (ServiceResponse<PostDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to find post: " + e.getMessage())),
                    "findById-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("findByUserPaginated")
    public Page<PostDTO> findByUser(@BrokerParam("userId") String userId, @BrokerParam("page") int page,
            @BrokerParam("size") int size) {
        log.info("Find posts by user {} page {} size {}", userId, page, size);
        return postRepository.findByPostedBy_Id(UUID.fromString(userId), PageRequest.of(page, size)).map(Post::toDTO);
    }

    @BrokerOperation("deleteComment")
    public ServiceResponse<String> deleteComment(@BrokerParam("postId") String postId,
            @BrokerParam("commentId") String commentId) {
        log.info("Delete comment {} from post {}", commentId, postId);
        try {
            Optional<Post> postOpt = postRepository.findById(UUID.fromString(postId));
            Optional<Comment> commentOpt = commentRepository.findById(UUID.fromString(commentId));

            if (postOpt.isEmpty()) {
                return (ServiceResponse<String>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "Post " + postId + " not found")),
                        "deleteComment-" + System.currentTimeMillis());
            }
            if (commentOpt.isEmpty()) {
                return (ServiceResponse<String>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "Comment " + commentId + " not found")),
                        "deleteComment-" + System.currentTimeMillis());
            }

            Post post = postOpt.get();
            Comment comment = commentOpt.get();

            if (post.getReplies().remove(comment)) {
                postRepository.save(post);
                commentRepository.delete(comment);
                return ServiceResponse.ok("Comment deleted successfully",
                        "deleteComment-" + System.currentTimeMillis());
            } else {
                return (ServiceResponse<String>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "Comment not found in post replies")),
                        "deleteComment-" + System.currentTimeMillis());
            }
        } catch (Exception e) {
            log.error("Error deleting comment: {}", e.getMessage());
            return (ServiceResponse<String>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to delete comment: " + e.getMessage())),
                    "deleteComment-" + System.currentTimeMillis());
        }
    }

    public Page<Post> findByForumId(Long forumId, Pageable pageable) {
        log.info("Find posts for forum id {}", forumId);
        return postRepository.findByForumId(forumId, pageable);
    }

    @BrokerOperation("findAll")
    public ServiceResponse<Set<PostDTO>> findAll() {
        log.info("Find all posts");
        try {
            Set<PostDTO> posts = postRepository.findAll().stream()
                    .map(p -> p.toDTO())
                    .collect(Collectors.toSet());
            return ServiceResponse.ok(posts, "findAll-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error finding all posts: {}", e.getMessage());
            return (ServiceResponse<Set<PostDTO>>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to find posts: " + e.getMessage())),
                    "findAll-" + System.currentTimeMillis());
        }
    }

    public PostDTO save(User postedBy, String text) {
        log.info("Save post by user {}", postedBy.getAlias());
        Post post = new Post();
        post.setPostedBy(postedBy);
        post.setText(text);

        return postRepository.save(post).toDTO();
    }

    public PostDTO save(User postedBy, User postedTo, String text) {
        log.info("Save post by user {} to user {}", postedBy.getAlias(), postedTo.getAlias());
        return postRepository.save(new Post(postedBy, postedTo, text)).toDTO();
    }

    public PostDTO save(User postedBy, Long forumId, String text) {
        log.info("Save post by user {} to forum {}", postedBy.getAlias(), forumId);
        Post post = new Post();
        post.setPostedBy(postedBy);
        post.setForumId(forumId);
        post.setText(text);

        return postRepository.save(post).toDTO();
    }

    @BrokerOperation("save")
    public ServiceResponse<PostDTO> save(@BrokerParam("post") PostDTO post) {
        log.info("Save post {}", post.getText());
        try {
            Optional<User> postedBy = userRepository.findByAlias(post.getPostedBy());

            if (postedBy.isEmpty()) {
                return (ServiceResponse<PostDTO>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "User not found: " + post.getPostedBy())),
                        "save-" + System.currentTimeMillis());
            }

            // handle forum post
            if (post.getForumId() != null) {
                PostDTO result = save(postedBy.get(), post.getForumId(), post.getText());
                return ServiceResponse.ok(result, "save-" + System.currentTimeMillis());
            }

            // handle post where post.getPostedTo is null
            if (post.getPostedTo() == null) {
                PostDTO result = save(postedBy.get(), post.getText());
                return ServiceResponse.ok(result, "save-" + System.currentTimeMillis());
            }

            // handle post where post.getPostedTo is not null
            Optional<User> postedTo = userRepository.findByAlias(post.getPostedTo());
            if (postedTo.isPresent()) {
                PostDTO result = save(postedBy.get(), postedTo.get(), post.getText());
                return ServiceResponse.ok(result, "save-" + System.currentTimeMillis());
            }

            return (ServiceResponse<PostDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Invalid post data or user not found")),
                    "save-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error saving post: {}", e.getMessage());
            return (ServiceResponse<PostDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to save post: " + e.getMessage())),
                    "save-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("addPostToForum")
    public ServiceResponse<PostDTO> addPostToForum(@BrokerParam("forumId") Long forumId,
            @BrokerParam("post") PostDTO post) {
        log.info("Add post {} to forum {}", post.getText(), forumId);
        try {
            Optional<User> postedBy = userRepository.findByAlias(post.getPostedBy());

            if (postedBy.isEmpty()) {
                return (ServiceResponse<PostDTO>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "User not found: " + post.getPostedBy())),
                        "addPostToForum-" + System.currentTimeMillis());
            }

            PostDTO result = save(postedBy.get(), forumId, post.getText());
            return ServiceResponse.ok(result, "addPostToForum-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error adding post to forum: {}", e.getMessage());
            return (ServiceResponse<PostDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to add post to forum: " + e.getMessage())),
                    "addPostToForum-" + System.currentTimeMillis());
        }
    }

    public PostDTO save(Post post) {
        log.info("Save post {}", post.getId());
        return postRepository.save(post).toDTO();
    }

    public PostDTO update(Post post, String change) {
        log.info("Update post {}", post.getId());
        Edit edit = new Edit(post.getText());
        edit.setPost(post);
        editRepository.save(edit);

        post.setText(change);
        post.getEdits().add(edit);

        return postRepository.save(post).toDTO();
    }

    @BrokerOperation("incrementRating")
    public ServiceResponse<PostStatDTO> incrementRating(@BrokerParam("postId") String postId) {
        log.info("Increment rating for post id {}", postId);
        try {
            Optional<Post> postOpt = postRepository.findById(UUID.fromString(postId));
            if (postOpt.isPresent()) {
                Post post = postOpt.get();
                Long currentRating = post.getRating();
                post.setRating(currentRating != null ? currentRating + 1 : 1);
                postRepository.save(post);
                return ServiceResponse.ok(post.toStatDTO(), "incrementRating-" + System.currentTimeMillis());
            }
            return (ServiceResponse<PostStatDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Post " + postId + " not found")),
                    "incrementRating-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error incrementing rating: {}", e.getMessage());
            return (ServiceResponse<PostStatDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to increment rating: " + e.getMessage())),
                    "incrementRating-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("decrementRating")
    public ServiceResponse<PostStatDTO> decrementRating(@BrokerParam("postId") String postId) {
        log.info("Decrement rating for post id {}", postId);
        try {
            Optional<Post> postOpt = postRepository.findById(UUID.fromString(postId));
            if (postOpt.isPresent()) {
                Post post = postOpt.get();
                Long currentRating = post.getRating();
                post.setRating(currentRating != null && currentRating > 0 ? currentRating - 1 : 0);
                postRepository.save(post);
                return ServiceResponse.ok(post.toStatDTO(), "decrementRating-" + System.currentTimeMillis());
            }
            return (ServiceResponse<PostStatDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Post " + postId + " not found")),
                    "decrementRating-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error decrementing rating: {}", e.getMessage());
            return (ServiceResponse<PostStatDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to decrement rating: " + e.getMessage())),
                    "decrementRating-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("addReaction")
    public ServiceResponse<ReactionDTO> addReaction(@BrokerParam("postId") String postId,
            @BrokerParam("reactionDTO") ReactionDTO reactionDTO) {
        log.info("Add reaction to post id {}", postId);
        try {
            Reaction.ReactionType type = Reaction.ReactionType.valueOf(reactionDTO.getType().toUpperCase());
            Optional<User> userOpt = this.userRepository.findByAlias(reactionDTO.getAlias());
            Optional<Post> postOpt = postRepository.findById(UUID.fromString(postId));

            if (userOpt.isEmpty()) {
                return (ServiceResponse<ReactionDTO>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "User not found: " + reactionDTO.getAlias())),
                        "addReaction-" + System.currentTimeMillis());
            }

            if (postOpt.isEmpty()) {
                return (ServiceResponse<ReactionDTO>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "Post " + postId + " not found")),
                        "addReaction-" + System.currentTimeMillis());
            }

            Post post = postOpt.get();
            User user = userOpt.get();

            Reaction reaction = new Reaction(user, type);
            reaction.setPost(post);
            Reaction saved = reactionRepository.save(reaction);
            post.getReactions().add(saved);
            postRepository.save(post);

            return ServiceResponse.ok(saved.toDTO(), "addReaction-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error adding reaction: {}", e.getMessage());
            return (ServiceResponse<ReactionDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to add reaction: " + e.getMessage())),
                    "addReaction-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("removeReaction")
    public ServiceResponse<String> removeReaction(@BrokerParam("postId") String postId,
            @BrokerParam("reactionDTO") ReactionDTO reactionDTO) {
        log.info("Remove reaction from post id {}", postId);
        try {
            Optional<Reaction> reactionOpt = this.reactionRepository.findById(UUID.fromString(reactionDTO.getId()));
            Optional<Post> postOpt = postRepository.findById(UUID.fromString(postId));

            if (postOpt.isEmpty()) {
                return (ServiceResponse<String>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "Post " + postId + " not found")),
                        "removeReaction-" + System.currentTimeMillis());
            }

            if (reactionOpt.isEmpty()) {
                return (ServiceResponse<String>) ServiceResponse.error(
                        java.util.List
                                .of(java.util.Map.of("message", "Reaction " + reactionDTO.getId() + " not found")),
                        "removeReaction-" + System.currentTimeMillis());
            }

            Post post = postOpt.get();
            Reaction reaction = reactionOpt.get();

            post.getReactions().remove(reaction);
            reactionRepository.delete(reaction);
            postRepository.save(post);

            return ServiceResponse.ok("Reaction removed successfully", "removeReaction-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error removing reaction: {}", e.getMessage());
            return (ServiceResponse<String>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to remove reaction: " + e.getMessage())),
                    "removeReaction-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("getRepliesForPost")
    public ServiceResponse<java.util.Set<CommentDTO>> getRepliesForPost(@BrokerParam("postId") String postId) {
        log.info("Get replies for post id {}", postId);
        try {
            Optional<Post> result = postRepository.findById(UUID.fromString(postId));
            if (result.isPresent()) {
                java.util.Set<CommentDTO> replies = result.get().toDTO().getReplies();
                return ServiceResponse.ok(replies, "getRepliesForPost-" + System.currentTimeMillis());
            }
            return (ServiceResponse<java.util.Set<CommentDTO>>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Post " + postId + " not found")),
                    "getRepliesForPost-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error getting replies for post: {}", e.getMessage());
            return (ServiceResponse<java.util.Set<CommentDTO>>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to get replies: " + e.getMessage())),
                    "getRepliesForPost-" + System.currentTimeMillis());
        }
    }

}