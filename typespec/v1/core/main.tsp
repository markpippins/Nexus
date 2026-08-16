// Shared model library — NOT a service.
// Core defines canonical DTOs that service namespaces import; it exposes no
// routes and is never emitted as a standalone service contract. (Demoted from
// @service in Wave 4 folder hygiene — service role belongs to the *-broker/
// *-registry namespaces, not to core.)
namespace com.aibizarchitect.nexus.v1.core;


/** Binary data placeholder for canonical core. */
model BinaryData {
  /** Base64 representation of binary payload */
  base64?: string;
}

// ============================================================================
// Response Models
// ============================================================================

/** Pagination metadata — matches JVM com.aibizarchitect.nexus.v1.dto.PagedResponse.Meta */
model PagedMeta {
  /** Current page index (0-based) */
  page: int32;
  /** Items per page */
  per_page: int32;
  /** Total items across all pages */
  total: int64;
  /** Last page index */
  last_page: int32;
  /** URL for the next page (null on last page) */
  next_page_url?: string;
}

/** Generic paged wrapper for API responses — matches JVM com.aibizarchitect.nexus.v1.dto.PagedResponse */
model PagedResponse<T> {
  data: T[];
  meta: PagedMeta;
}

/**
 * Error response structure.
 */
model ErrorResponse {
  /** Error message */
  message: string;

  /** HTTP status code */
  status: int32;

  /** Timestamp when error occurred */
  timestamp: utcDateTime;

  /** Request path that caused the error */
  path?: string;

  /** Detailed error details */
  details?: string[];
}
