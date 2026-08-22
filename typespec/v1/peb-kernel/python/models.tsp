/**
 * peb-kernel — TypeSpec Models
 *
 * Reverse-engineered from python/peb-kernel/src/peb_kernel/api.py (FastAPI).
 * No route or verb decorators live here.
 */
namespace org.nexus.pebkernel {

  /** Admission request for a PEB transaction. */
  model PebTransactionRequest {
    /** Optional caller-supplied UUID; the Python domain assigns one when omitted. */
    @format("uuid")
    id?: string;
    idempotencyKey: string;
    entityId: string;
    toolName: string;
    input: unknown;
  }

  /** Admission decision shared with the Spring PEB contract. */
  model AdmissionResponse {
    message: string;
    admitted: boolean;
  }

  /** Health response. */
  model PebHealthResponse {
    status: string;
    database?: string;
    schema?: string;
  }
}
