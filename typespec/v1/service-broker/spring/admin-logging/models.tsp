/**
 * Admin Logging Models
 *
 * Maps to JVM package com.aibizarchitect.nexus.v1.spring.admin.logging
 * (MongoDB @Document, collection admin_log_entries).
 * Data-only module — no HTTP surface.
 */

namespace com.aibizarchitect.nexus.v1.spring.admin.logging {

  /** An admin audit-log entry. */
  model AdminLogEntry {
    @format("uuid")
    id?: string;
    timestamp?: utcDateTime;
    serverId?: string;
    serverPort?: int32;
    serverConfig?: string;
    userId?: string;
    service?: string;
    operation?: string;
    /** JSON or serialized form of request parameters. */
    requestParams?: string;
    successStatus?: boolean;
    errorMessage?: string;
    requestId?: string;
  }
}
