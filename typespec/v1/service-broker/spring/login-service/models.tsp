/**
 * Login Service Models
 *
 * Maps to JVM package com.aibizarchitect.nexus.v1.spring.login.
 * Data-only module — no HTTP surface (login delegates to user-access-service
 * via a Feign client).
 */

namespace com.aibizarchitect.nexus.v1.spring.login {

  /** Response from a login attempt. */
  model LoginResponse {
    userId?: string;
    token?: string;
    status?: string;
    message?: string;
  }
}
