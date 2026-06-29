/**
 * Nexus User API — shared user models
 *
 * Framework-neutral user DTOs shared across services.
 * Matches JVM types in com.aibizarchitect.nexus.v1.user.
 */
namespace com.aibizarchitect.nexus.v1.user {

  /** Core user data transfer object */
  model UserDTO {
    id?: string;
    /** User login alias */
    userAlias: string;
    email?: string;
    admin?: boolean = false;
    avatarUrl?: string;
  }

  /** User registration data transfer object */
  model UserRegistrationDTO {
    id?: string;
    /** User login alias */
    userAlias: string;
    email?: string;
    admin?: boolean = false;
  }
}
