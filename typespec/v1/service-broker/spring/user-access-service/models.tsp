/**
 * User Access Service Models
 *
 * User validation and registration models.
 * Maps to JPA entity UserRegistration in com.aibizarchitect.nexus.v1.spring.user.entity.
 */
import "../../../user-api/main.tsp";

namespace com.aibizarchitect.nexus.v1.spring.user {

  /** User registration JPA entity (table: users, schema: gateway) */
  model UserRegistration {
    id: int64;
    /** Login alias — unique, not null */
    userAlias: string;
    /** Email address — unique */
    email?: string;
    /** Whether user has admin privileges */
    admin?: boolean = false;
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
  }

}
