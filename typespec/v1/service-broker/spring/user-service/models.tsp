/**
 * User Service Models
 *
 * Maps to JVM package com.aibizarchitect.nexus.v1.spring.user.
 * Data-only module — no HTTP surface.
 */

namespace com.aibizarchitect.nexus.v1.spring.user {

  /** A user entity. */
  model User {
    id?: string;
    identifier?: string;
    /** Login alias — TypeSpec keyword, escaped. */
    `alias`?: string;
    email?: string;
  }
}
