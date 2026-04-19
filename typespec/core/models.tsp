/**
 * Canonical Core Models (Language-agnostic)
 */
namespace com.aibizarchitect.nexus.core.v1;

/** Binary data placeholder for canonical core. */
model BinaryData {
  /** Base64 representation of binary payload */
  base64?: string;
}

/** Service request across the polyglot mesh. */
model ServiceRequest {
  service: string;
  operation: string;
  /** Parameters for the operation, mapped to BinaryData in core */
  params: Record<string, BinaryData>;
  requestId: string;
  encrypt?: boolean;
}

/** Error details for broker responses. */
model ResponseError {
  field?: string;
  message: string;
}

/** Canonical service response body. */
model ServiceResponseBody {
  ok: boolean;
  /** Data payload (binary in core). */
  data?: BinaryData;
  /** Optional errors when ok is false. */
  errors?: ResponseError[];
  requestId: string;
  ts?: string; // canonical timestamp (ISO8601)
  version?: string;
  service?: string;
  operation?: string;
  encrypt?: boolean;
}

/** Generic paged wrapper for API responses. */
model PagedResponse<T> {
  data: T[];
  totalElements: int64;
  totalPages: int32;
  number: int32; // current page index (0-based)
  numberOfElements: int32;
  size: int32;
}
