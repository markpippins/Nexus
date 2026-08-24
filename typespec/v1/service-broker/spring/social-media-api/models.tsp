/**
 * Social Media API DTOs
 *
 * Request/response DTOs. Maps to JVM package
 * com.aibizarchitect.nexus.v1.spring.social.
 * Data-only module — no HTTP surface.
 */

namespace com.aibizarchitect.nexus.v1.spring.social {

  model ForumDTO {
    id?: string;
    name?: string;
  }

  model PostDTO {
    forumId?: int64;
  }

  model PostStatDTO {
    id?: int64;
    rating?: int64;
    postId?: int64;
  }

  model UserDTO {
    id?: string;
    `alias`?: string;
    identifier?: string;
    email?: string;
    avatarUrl?: string;
    admin?: boolean;
  }

  model UserRegistrationDTO {
    id?: string;
    `alias`?: string;
    identifier?: string;
    email?: string;
    avatarUrl?: string;
    admin?: boolean;
  }

  model AbstractContentDTO {
    id?: string;
    postedBy?: string;
    postedTo?: string;
    postedDate?: string;
    text?: string;
    rating?: int64;
    url?: string;
  }

  model CommentDTO {
    postId?: string;
    parentId?: string;
  }

  model ReactionDTO {
    id?: string;
    type?: string;
    `alias`?: string;
  }

  model ProfileDTO {
    id?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    state?: string;
    profileImageUrl?: string;
  }
}
