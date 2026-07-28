package com.aibizarchitect.nexus.v1.spring.social;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Social Media API DTOs")
class SocialMediaApiDtoTests {

    @Nested
    @DisplayName("AbstractContentDTO")
    class AbstractContentDTOTests {
        @Test @DisplayName("default constructor + setters/getters")
        void settersAndGetters() {
            AbstractContentDTO dto = new AbstractContentDTO() {};
            dto.setId("c1");
            dto.setPostedBy("alice");
            dto.setPostedTo("forum-1");
            dto.setText("Hello world");
            dto.setRating(5L);
            dto.setUrl("http://example.com");

            assertEquals("c1", dto.getId());
            assertEquals("alice", dto.getPostedBy());
            assertEquals("forum-1", dto.getPostedTo());
            assertEquals("Hello world", dto.getText());
            assertEquals(5L, dto.getRating());
            assertEquals("http://example.com", dto.getUrl());
        }
    }

    @Nested
    @DisplayName("CommentDTO")
    class CommentDTOTests {
        @Test @DisplayName("extends AbstractContentDTO with postId and parentId")
        void fields() {
            CommentDTO dto = new CommentDTO();
            dto.setPostId("p1");
            dto.setParentId("parent-1");
            dto.setText("Nice post!");

            assertEquals("p1", dto.getPostId());
            assertEquals("parent-1", dto.getParentId());
            assertEquals("Nice post!", dto.getText());
        }
    }

    @Nested
    @DisplayName("PostDTO")
    class PostDTOTests {
        @Test @DisplayName("extends AbstractContentDTO with forumId")
        void fields() {
            PostDTO dto = new PostDTO();
            dto.setId("p1");
            dto.setForumId(42L);
            dto.setText("My first post");
            dto.setPostedBy("bob");

            assertEquals("p1", dto.getId());
            assertEquals(42L, dto.getForumId());
            assertEquals("My first post", dto.getText());
            assertEquals("bob", dto.getPostedBy());
        }
    }

    @Nested
    @DisplayName("ForumDTO")
    class ForumDTOTests {
        @Test @DisplayName("id and name fields")
        void fields() {
            ForumDTO dto = new ForumDTO();
            dto.setId("f1");
            dto.setName("General");

            assertEquals("f1", dto.getId());
            assertEquals("General", dto.getName());
        }
    }

    @Nested
    @DisplayName("PostStatDTO")
    class PostStatDTOTests {
        @Test @DisplayName("id, rating, postId fields")
        void fields() {
            PostStatDTO dto = new PostStatDTO();
            dto.setId(1L);
            dto.setRating(10L);
            dto.setPostId(2L);

            assertEquals(1L, dto.getId());
            assertEquals(10L, dto.getRating());
            assertEquals(2L, dto.getPostId());
        }
    }

    @Nested
    @DisplayName("ProfileDTO")
    class ProfileDTOTests {
        @Test @DisplayName("personal info + Set<String> fields")
        void fields() {
            ProfileDTO dto = new ProfileDTO();
            dto.setId("prof-1");
            dto.setFirstName("Alice");
            dto.setLastName("Smith");
            dto.setCity("Portland");
            dto.setState("OR");
            dto.setProfileImageUrl("http://img.com/a.jpg");
            dto.setInterests(Set.of("java", "ai"));
            dto.setSkills(Set.of("coding"));
            dto.setLanguages(Set.of("en", "es"));

            assertEquals("Alice", dto.getFirstName());
            assertEquals("Smith", dto.getLastName());
            assertEquals(Set.of("java", "ai"), dto.getInterests());
            assertEquals(2, dto.getLanguages().size());
        }
    }

    @Nested
    @DisplayName("ReactionDTO")
    class ReactionDTOTests {
        @Test @DisplayName("id, type, alias fields")
        void fields() {
            ReactionDTO dto = new ReactionDTO();
            dto.setId("r1");
            dto.setType("LIKE");
            dto.setAlias("alice");

            assertEquals("r1", dto.getId());
            assertEquals("LIKE", dto.getType());
            assertEquals("alice", dto.getAlias());
        }
    }

    @Nested
    @DisplayName("UserDTO")
    class UserDTOTests {
        @Test @DisplayName("user fields + social graph sets")
        void fields() {
            UserDTO dto = new UserDTO();
            dto.setId("u1");
            dto.setAlias("codex");
            dto.setEmail("codex@nexus.dev");
            dto.setAvatarUrl("http://av.com/c.png");
            dto.setFollowers(Set.of("alice", "bob"));
            dto.setFollowing(Set.of("charlie"));
            dto.setFriends(Set.of("dave"));

            assertEquals("codex", dto.getAlias());
            assertEquals("codex@nexus.dev", dto.getEmail());
            assertEquals(2, dto.getFollowers().size());
        }
    }

    @Nested
    @DisplayName("UserRegistrationDTO")
    class UserRegistrationDTOTests {
        @Test @DisplayName("alias, identifier, email fields")
        void fields() {
            UserRegistrationDTO dto = new UserRegistrationDTO();
            dto.setId("ur-1");
            dto.setAlias("newuser");
            dto.setIdentifier("auth0|123");
            dto.setEmail("new@user.com");

            assertEquals("ur-1", dto.getId());
            assertEquals("newuser", dto.getAlias());
            assertEquals("auth0|123", dto.getIdentifier());
        }

        @Test @DisplayName("null fields allowed")
        void null_fields_allowed() {
            UserRegistrationDTO dto = new UserRegistrationDTO();
            assertNull(dto.getAlias());
            assertNull(dto.getEmail());
        }
    }
}
