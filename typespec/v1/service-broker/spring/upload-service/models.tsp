/**
 * Upload Service Models
 *
 * File upload handling for broker-submitted requests.
 */

namespace com.aibizarchitect.nexus.v1.spring.upload {

  /** Log parsing error result */
  model LogError {
    lineNumber: int32;
    line: string;
  }

  /** File upload request — text fields and binary content */
  model FileUploadRequest {
    /** Target service name */
    service: string;
    /** Target operation name */
    operation: string;
    /** JSON-serialized operation parameters */
    params?: string;
    /** Client-provided request ID */
    requestId?: string;
    /** The file to upload */
    file: bytes;
  }
}
