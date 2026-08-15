/**
 * Social Media Models
 *
 * JPA entities for forums/posts/comments/reactions/profiles.
 * Maps to JVM package com.aibizarchitect.nexus.v1.spring.social.model
 * (TypeSpec namespace drops the `model` keyword segment).
 * Data-only module — no HTTP surface.
 */

namespace com.aibizarchitect.nexus.v1.spring.social {

  /** A user (author/actor). */
  model User {
    @format("uuid")
    id?: string;
    identifier: string;
    /** Login alias — TypeSpec keyword, escaped. */
    `alias`: string;
    email?: string;
  }

  /** A forum container. */
  model Forum {
    @format("uuid")
    id?: string;
    name: string;
  }

  /** An interest tag. */
  model Interest {
    @format("uuid")
    id?: string;
    name: string;
  }

  /** Abstract base for post/comment content. */
  model AbstractContent {
    @format("uuid")
    id?: string;
    created?: utcDateTime;
    updated?: utcDateTime;
    text?: string;
    url?: string;
    rating?: int64;
  }

  /** A post within a forum. */
  model Post extends AbstractContent {
    postedBy?: User;
    postedTo?: User;
    forumId?: int64;
    sourceUrl?: string;
    title?: string;
    replies?: Comment[];
    edits?: Edit[];
    reactions?: Reaction[];
  }

  /** A comment on a post. */
  model Comment extends AbstractContent {
    postedBy?: User;
    post?: Post;
    replies?: Comment[];
    reactions?: Reaction[];
    edits?: Edit[];
  }

  /** Reaction type on content. */
  enum ReactionType {
    LIKE,
    LOVE,
    ANGER,
    SADNESS,
    SURPRISE,
  }

  /** A reaction to a post or comment. */
  model Reaction {
    @format("uuid")
    id?: string;
    created?: utcDateTime;
    reactionType?: ReactionType;
    user?: User;
    post?: Post;
    comment?: Comment;
  }

  /** An edit to a post or comment. */
  model Edit {
    @format("uuid")
    id?: string;
    created?: utcDateTime;
    updated?: utcDateTime;
    text?: string;
    post?: Post;
    comment?: Comment;
  }

  /** A user profile. */
  model Profile {
    @format("uuid")
    id?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    state?: string;
    profileImageUrl?: string;
    user?: User;
    interests?: Interest[];
  }
}
