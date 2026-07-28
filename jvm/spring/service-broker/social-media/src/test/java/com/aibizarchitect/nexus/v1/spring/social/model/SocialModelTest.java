package com.aibizarchitect.nexus.v1.spring.social.model;

import static org.junit.jupiter.api.Assertions.*;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("Social Media Models")
class SocialModelTest {

    // ── Post ────────────────────────────────────────────────────

    @Nested
    @DisplayName("Post")
    class PostTests {

        private User user;

        @BeforeEach
        void setUp() {
            user = new User("poster", "poster@example.com", "https://avatar.url");
            user.setId(UUID.randomUUID());
        }

        @Test
        @DisplayName("prePersist: generates UUID when id is null")
        void prePersist_generatesId() {
            Post post = new Post();
            post.prePersist();
            assertNotNull(post.getId());
        }

        @Test
        @DisplayName("prePersist: preserves existing UUID")
        void prePersist_preservesExistingId() {
            Post post = new Post();
            UUID existing = UUID.randomUUID();
            post.setId(existing);
            post.prePersist();
            assertEquals(existing, post.getId());
        }

        @Test
        @DisplayName("toDTO: full post with replies and reactions")
        void toDTO_fullPost() {
            Post post = new Post(user, null, "Hello world");
            post.setId(UUID.randomUUID());
            post.setForumId(42L);
            post.setRating(3L);

            var dto = post.toDTO();

            assertEquals("Hello world", dto.getText());
            assertEquals("poster", dto.getPostedBy());
            assertEquals(42L, dto.getForumId());
            assertNotNull(dto.getReplies());
            assertNotNull(dto.getReactions());
        }

        @Test
        @DisplayName("toDTO: null postedBy handled gracefully")
        void toDTO_nullPostedBy() {
            Post post = new Post();
            post.setId(UUID.randomUUID());
            post.setText("content");
            // leave postedBy null

            var dto = post.toDTO();

            assertNull(dto.getPostedBy());
        }

        @Test
        @DisplayName("toDTO: null replies returns empty set")
        void toDTO_nullReplies() {
            Post post = new Post(user, null, "content");
            post.setId(UUID.randomUUID());
            // replies defaults to empty HashSet, but toDTO checks null

            var dto = post.toDTO();

            assertNotNull(dto.getReplies());
            assertTrue(dto.getReplies().isEmpty());
        }

        @Test
        @DisplayName("toStatDTO: converts to stat DTO with rating")
        void toStatDTO() {
            Post post = new Post(user, null, "content");
            post.setId(UUID.randomUUID());
            post.setRating(5L);

            var dto = post.toStatDTO();

            assertNotNull(dto.getId());
            assertEquals(5L, dto.getRating());
        }

        @Test
        @DisplayName("constructor: three-arg constructor sets fields")
        void constructor_threeArg() {
            User target = new User("target", "t@e.com", "url");
            Post post = new Post(user, target, "direct message");

            assertEquals(user, post.getPostedBy());
            assertEquals(target, post.getPostedTo());
            assertEquals("direct message", post.getText());
        }
    }

    // ── Comment ─────────────────────────────────────────────────

    @Nested
    @DisplayName("Comment")
    class CommentTests {

        private User user;
        private Post post;

        @BeforeEach
        void setUp() {
            user = new User("commenter", "c@example.com", "https://avatar.url");
            user.setId(UUID.randomUUID());
            post = new Post(user, null, "Post");
            post.setId(UUID.randomUUID());
        }

        @Test
        @DisplayName("toDTO: full comment with parent")
        void toDTO_fullComment() {
            Comment parent = new Comment(user, "Parent");
            parent.setId(UUID.randomUUID());

            Comment comment = new Comment(user, "Reply", parent);
            comment.setId(UUID.randomUUID());
            comment.setPost(post);

            var dto = comment.toDTO();

            assertEquals("Reply", dto.getText());
            assertEquals("commenter", dto.getPostedBy());
            assertEquals(post.getId().toString(), dto.getPostId());
            assertEquals(parent.getId().toString(), dto.getParentId());
        }

        @Test
        @DisplayName("constructor: user+text")
        void constructor_userAndText() {
            Comment c = new Comment(user, "Nice!");

            assertEquals("Nice!", c.getText());
            assertEquals(user, c.getPostedBy());
        }

        @Test
        @DisplayName("constructor: user+text+post")
        void constructor_withPost() {
            Comment c = new Comment(user, "Nice!", post);

            assertEquals(post, c.getPost());
        }

        @Test
        @DisplayName("constructor: user+text+parent")
        void constructor_withParent() {
            Comment parent = new Comment(user, "Parent");
            Comment c = new Comment(user, "Reply", parent);

            assertEquals(parent, c.getParent());
        }
    }

    // ── Forum ───────────────────────────────────────────────────

    @Nested
    @DisplayName("Forum")
    class ForumTests {

        @Test
        @DisplayName("prePersist: generates UUID")
        void prePersist_generatesId() {
            Forum f = new Forum("Test");
            f.prePersist();
            assertNotNull(f.getId());
        }

        @Test
        @DisplayName("addMember: adds user to members")
        void addMember_addsUser() {
            Forum f = new Forum("Test");
            User u = new User("member", "m@e.com", "url");
            u.setId(UUID.randomUUID());

            f.addMember(u);

            assertEquals(1, f.getMembers().size());
            assertTrue(f.getMembers().contains(u));
        }

        @Test
        @DisplayName("addMember: initializes null members set")
        void addMember_initializesNullSet() {
            Forum f = new Forum("Test");
            // members is null (not initialized)
            User u = new User("member", "m@e.com", "url");
            u.setId(UUID.randomUUID());

            f.addMember(u);

            assertNotNull(f.getMembers());
            assertEquals(1, f.getMembers().size());
        }

        @Test
        @DisplayName("toDTO: converts forum with members")
        void toDTO_withMembers() {
            Forum f = new Forum("Test");
            f.setId(UUID.randomUUID());
            User u = new User("member", "m@e.com", "url");
            u.setId(UUID.randomUUID());
            f.addMember(u);

            var dto = f.toDTO();

            assertEquals("Test", dto.getName());
            assertEquals(1, dto.getMembers().size());
        }
    }

    // ── User ────────────────────────────────────────────────────

    @Nested
    @DisplayName("User")
    class UserTests {

        @Test
        @DisplayName("prePersist: generates UUID")
        void prePersist_generatesId() {
            User u = new User();
            u.prePersist();
            assertNotNull(u.getId());
        }

        @Test
        @DisplayName("toDTO: converts user with followers/following/friends")
        void toDTO_full() {
            User u = new User("main", "main@e.com", "url");
            u.setId(UUID.randomUUID());
            u.setIdentifier("ident-123");
            u.setAdmin(true);

            var dto = u.toDTO();

            assertEquals("main", dto.getAlias());
            assertEquals("main@e.com", dto.getEmail());
            assertEquals("ident-123", dto.getIdentifier());
            assertTrue(dto.isAdmin());
            assertNotNull(dto.getFollowers());
            assertNotNull(dto.getFollowing());
            assertNotNull(dto.getFriends());
        }

        @Test
        @DisplayName("toDTO: null followers/following/friends returns empty sets")
        void toDTO_nullSocial() {
            User u = new User("main", "main@e.com", "url");
            u.setId(UUID.randomUUID());

            var dto = u.toDTO();

            assertNotNull(dto.getFollowers());
            assertTrue(dto.getFollowers().isEmpty());
            assertTrue(dto.getFollowing().isEmpty());
            assertTrue(dto.getFriends().isEmpty());
        }

        @Test
        @DisplayName("constructor: three-arg")
        void constructor_threeArg() {
            User u = new User("alias", "e@mail.com", "https://av.url");

            assertEquals("alias", u.getAlias());
            assertEquals("e@mail.com", u.getEmail());
            assertEquals("https://av.url", u.getAvatarUrl());
        }

        @Test
        @DisplayName("constructor: four-arg with identifier")
        void constructor_fourArg() {
            User u = new User("alias", "e@mail.com", "https://av.url", "id-42");

            assertEquals("id-42", u.getIdentifier());
        }
    }

    // ── Profile ─────────────────────────────────────────────────

    @Nested
    @DisplayName("Profile")
    class ProfileTests {

        @Test
        @DisplayName("prePersist: generates UUID")
        void prePersist_generatesId() {
            Profile p = new Profile();
            p.prePersist();
            assertNotNull(p.getId());
        }

        @Test
        @DisplayName("toDTO: converts profile with interests")
        void toDTO_withInterests() {
            Profile p = new Profile();
            p.setId(UUID.randomUUID());
            p.setFirstName("John");
            p.setLastName("Doe");
            p.setCity("Portland");
            p.setState("OR");
            p.setProfileImageUrl("https://img.url");

            Interest interest = new Interest();
            interest.setName("Java");
            p.getInterests().add(interest);

            var dto = p.toDTO();

            assertEquals("John", dto.getFirstName());
            assertEquals("Doe", dto.getLastName());
            assertEquals("Portland", dto.getCity());
            assertEquals("OR", dto.getState());
            assertEquals("https://img.url", dto.getProfileImageUrl());
            assertEquals(1, dto.getInterests().size());
            assertTrue(dto.getInterests().contains("Java"));
        }

        @Test
        @DisplayName("toDTO: null interests returns empty set")
        void toDTO_nullInterests() {
            Profile p = new Profile();
            p.setId(UUID.randomUUID());

            var dto = p.toDTO();

            assertNotNull(dto.getInterests());
            assertTrue(dto.getInterests().isEmpty());
        }
    }

    // ── Reaction ────────────────────────────────────────────────

    @Nested
    @DisplayName("Reaction")
    class ReactionTests {

        private User user;

        @BeforeEach
        void setUp() {
            user = new User("reactor", "r@e.com", "url");
            user.setId(UUID.randomUUID());
        }

        @Test
        @DisplayName("prePersist: generates UUID and created timestamp")
        void prePersist_generatesIdAndTimestamp() {
            Reaction r = new Reaction();
            r.prePersist();
            assertNotNull(r.getId());
            assertNotNull(r.getCreated());
        }

        @Test
        @DisplayName("toDTO: converts reaction")
        void toDTO() {
            Reaction r = new Reaction(user, Reaction.ReactionType.LOVE);
            r.setId(UUID.randomUUID());

            var dto = r.toDTO();

            assertEquals("LOVE", dto.getType());
            assertEquals("reactor", dto.getAlias());
        }

        @Test
        @DisplayName("toDTO: null reactionType handled")
        void toDTO_nullType() {
            Reaction r = new Reaction();
            r.setId(UUID.randomUUID());
            r.setUser(user);

            var dto = r.toDTO();

            assertNull(dto.getType());
        }

        @Test
        @DisplayName("ReactionType: all enum values")
        void reactionType_allValues() {
            assertEquals(5, Reaction.ReactionType.values().length);
            assertNotNull(Reaction.ReactionType.valueOf("LIKE"));
            assertNotNull(Reaction.ReactionType.valueOf("LOVE"));
            assertNotNull(Reaction.ReactionType.valueOf("ANGER"));
            assertNotNull(Reaction.ReactionType.valueOf("SADNESS"));
            assertNotNull(Reaction.ReactionType.valueOf("SURPRISE"));
        }
    }

    // ── Edit ────────────────────────────────────────────────────

    @Nested
    @DisplayName("Edit")
    class EditTests {

        @Test
        @DisplayName("prePersist: generates UUID and created timestamp")
        void prePersist_generatesIdAndTimestamp() {
            Edit e = new Edit();
            e.prePersist();
            assertNotNull(e.getId());
            assertNotNull(e.getCreated());
        }

        @Test
        @DisplayName("constructor: sets previous text")
        void constructor_setsText() {
            Edit e = new Edit("previous content");

            assertEquals("previous content", e.getText());
        }
    }

    // ── AbstractContent ─────────────────────────────────────────

    @Nested
    @DisplayName("AbstractContent")
    class AbstractContentTests {

        @Test
        @DisplayName("prePersist: generates UUID when null")
        void prePersist_generatesId() {
            AbstractContent ac = new Post(); // concrete subclass
            ac.prePersist();
            assertNotNull(ac.getId());
        }

        @Test
        @DisplayName("getPostedDate: formats created date")
        void getPostedDate_formats() {
            Post post = new Post();
            post.setCreated(java.time.LocalDateTime.of(2026, 7, 25, 14, 30));

            assertEquals("2026-07-25", post.getPostedDate());
        }

        @Test
        @DisplayName("getPostedDate: null created returns null")
        void getPostedDate_nullCreated() {
            Post post = new Post();
            assertNull(post.getPostedDate());
        }
    }

    // ── Interest ────────────────────────────────────────────────

    @Nested
    @DisplayName("Interest")
    class InterestTests {

        @Test
        @DisplayName("prePersist: generates UUID")
        void prePersist_generatesId() {
            Interest i = new Interest();
            i.prePersist();
            assertNotNull(i.getId());
        }

        @Test
        @DisplayName("constructor: sets name")
        void constructor_setsName() {
            Interest i = new Interest();
            i.setName("Java");

            assertEquals("Java", i.getName());
        }
    }
}
