/**
 * User Creation Service Models
 *
 * Request DTO for user creation. The response reuses UserRegistration from
 * user-access-service (com.aibizarchitect.nexus.v1.spring.user).
 */

namespace com.aibizarchitect.nexus.v1.spring.usercreation {

  /** Request body for POST /api/v1/users (Map<String,String>). */
  model UserCreateRequest {
    /** Unique username — required. */
    `alias`: string;
    /** User email. */
    email?: string;
    /** Password / security identifier (persisted to the identifier column). */
    identifier: string;
    /** Whether the user has admin privileges. */
    admin?: boolean = false;
  }
}
